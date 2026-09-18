import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { pushLineMessage } from "@/lib/line";
import { bangkokDateKey, bangkokDateAt } from "@/lib/datetime";

const WORK_MS = 8 * 60 * 60 * 1000;
// Lunch isn't tracked as a separate check-out/check-in here — employees stay
// checked in straight through it — so 8 worked hours corresponds to 9 hours
// of raw elapsed time since check-in, not 8.
const LUNCH_BREAK_MS = 60 * 60 * 1000;
const EXPECTED_SPAN_MS = WORK_MS + LUNCH_BREAK_MS;
const WARNING_BEFORE_MS = 15 * 60 * 1000;
const WARNING_THRESHOLD_MS = EXPECTED_SPAN_MS - WARNING_BEFORE_MS;
// If nobody's confirmed OT by the time the calendar day rolls over, assume
// they just forgot to check out and cut it off at a normal 18:00 quitting
// time rather than let hours quietly pile up to midnight.
const FALLBACK_QUIT_HOUR = 18;

async function autoCheckOut(userId: string, location: string, detail: string, createdAt?: Date) {
  await prisma.checkIn.create({
    data: { userId, type: "OUT", location, confidence: null, ...(createdAt ? { createdAt } : {}) },
  });
  await prisma.activityLog.create({
    data: { userId, action: "CHECK_OUT", details: detail },
  });
  revalidatePath(`/users/${userId}`);
  revalidatePath("/attendance");
}

/**
 * Meant to run every few minutes (see README/setup notes — Vercel's Hobby
 * plan only allows once-daily cron, so this is triggered by an external
 * pinger instead of vercel.json). For everyone still clocked in with a
 * linked LINE account, behavior now splits by check-in location:
 *
 * - OFFICE: no self-serve "do OT?" prompt anymore — an admin/operator opens
 *   OT for someone from LINE instead (see the OT_GRANT_TRIGGER handling in
 *   the webhook route), which sets otGrantedHours on their open CheckIn.
 *   This just checks people out the moment they hit 8 worked hours, unless
 *   OT was granted, in which case it extends the deadline by that many
 *   hours and checks them out once *that* elapses. Still gets the 15-min
 *   heads-up warning.
 * - OUTSIDE: unchanged — self-serve ask at 8 worked hours, plus the
 *   midnight-rollover fallback (auto-checkout at 18:00 if never confirmed,
 *   one more re-ask if they did).
 *
 * "Still clocked in" mirrors getUserStatuses()'s definition: their most
 * recent CheckIn of any type is an "IN". reminderSentAt/otPromptSentAt/
 * midnightOtPromptSentAt on that same CheckIn row make each nudge idempotent
 * across runs.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const latestPerUser = await prisma.checkIn.findMany({
      orderBy: { createdAt: "desc" },
      distinct: ["userId"],
      include: { user: { select: { id: true, lineUserId: true, fullName: true, username: true } } },
    });

    const stillWorking = latestPerUser.filter(
      (c) => c.type === "IN" && c.user.lineUserId
    );

    const now = new Date();
    const nowMs = now.getTime();
    let warned = 0;
    let prompted = 0;
    let autoCheckedOut = 0;
    let midnightPrompted = 0;

    await Promise.all(
      stillWorking.map(async (checkIn) => {
        const lineUserId = checkIn.user.lineUserId!;
        const elapsedMs = nowMs - checkIn.createdAt.getTime();

        if (checkIn.location === "OFFICE") {
          const deadlineMs = checkIn.otGrantedHours
            ? EXPECTED_SPAN_MS + checkIn.otGrantedHours * 3_600_000
            : EXPECTED_SPAN_MS;

          if (elapsedMs >= deadlineMs) {
            await autoCheckOut(
              checkIn.userId,
              checkIn.location,
              checkIn.otGrantedHours
                ? `Auto checked out — granted OT (${checkIn.otGrantedHours}h) expired`
                : "Auto checked out at 8 worked hours — no OT opened"
            );
            autoCheckedOut++;
            return;
          }

          if (elapsedMs >= WARNING_THRESHOLD_MS && elapsedMs < EXPECTED_SPAN_MS && !checkIn.reminderSentAt) {
            await pushLineMessage(
              lineUserId,
              `ใกล้ครบเวลาทำงาน 8 ชั่วโมงแล้วนะคะ อีกประมาณ 15 นาทีค่ะ ถ้าหัวหน้าไม่เปิด OT ให้ ระบบจะเช็คเอาท์ให้อัตโนมัติค่ะ ⏰`
            );
            await prisma.checkIn.update({ where: { id: checkIn.id }, data: { reminderSentAt: now } });
            warned++;
          }
          return;
        }

        // OUTSIDE — unchanged self-serve ask + midnight fallback.
        if (bangkokDateKey(now) !== bangkokDateKey(checkIn.createdAt)) {
          if (checkIn.otConfirmedAt) {
            if (!checkIn.midnightOtPromptSentAt) {
              await pushLineMessage(lineUserId, `ผ่านเที่ยงคืนแล้วนะคะ ยังทำ OT อยู่ไหมคะ? 🌙`, [
                { label: "เลิกงานแล้ว", text: "เลิกงานแล้ว" },
                { label: "ทำ OT ต่อ", text: "ทำ OT ต่อ" },
              ]);
              await prisma.checkIn.update({ where: { id: checkIn.id }, data: { midnightOtPromptSentAt: now } });
              midnightPrompted++;
            }
            return;
          }

          const fallbackQuitTime = bangkokDateAt(checkIn.createdAt, FALLBACK_QUIT_HOUR);
          const outAt = fallbackQuitTime > checkIn.createdAt ? fallbackQuitTime : checkIn.createdAt;
          await autoCheckOut(
            checkIn.userId,
            checkIn.location,
            `Auto checked out at ${FALLBACK_QUIT_HOUR}:00 — no response by midnight`,
            outAt
          );
          autoCheckedOut++;
          return;
        }

        if (elapsedMs >= EXPECTED_SPAN_MS && !checkIn.otPromptSentAt) {
          await pushLineMessage(
            lineUserId,
            `ครบเวลาทำงาน 8 ชั่วโมงแล้วค่ะ ✨ วันนี้จะเลิกงานหรือทำ OT ต่อดีคะ?`,
            [
              { label: "เลิกงานแล้ว", text: "เลิกงานแล้ว" },
              { label: "ทำ OT ต่อ", text: "ทำ OT ต่อ" },
            ]
          );
          await prisma.checkIn.update({ where: { id: checkIn.id }, data: { otPromptSentAt: now } });
          prompted++;
          return;
        }

        if (elapsedMs >= WARNING_THRESHOLD_MS && elapsedMs < EXPECTED_SPAN_MS && !checkIn.reminderSentAt) {
          await pushLineMessage(lineUserId, `ใกล้ครบเวลาทำงาน 8 ชั่วโมงแล้วนะคะ อีกประมาณ 15 นาทีค่ะ ⏰`);
          await prisma.checkIn.update({ where: { id: checkIn.id }, data: { reminderSentAt: now } });
          warned++;
        }
      })
    );

    return NextResponse.json({ success: true, checked: stillWorking.length, warned, prompted, autoCheckedOut, midnightPrompted });
  } catch (error) {
    logError("Error running check-in reminders:", error);
    return NextResponse.json({ success: false, error: "Reminder run failed" }, { status: 500 });
  }
}
