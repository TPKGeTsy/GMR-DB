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

/**
 * Meant to run every few minutes (see README/setup notes — Vercel's Hobby
 * plan only allows once-daily cron, so this is triggered by an external
 * pinger instead of vercel.json). For everyone still clocked in with a
 * linked LINE account:
 * - Nudges them ~15 minutes before 8 worked hours (accounting for the
 *   untracked lunch break), then again once they're hit, asking if they're
 *   finishing up or doing OT.
 * - Once the calendar day rolls over past midnight on an still-open session:
 *   if they never confirmed OT, auto checks them out backdated to 18:00 that
 *   day; if they did confirm OT, asks once more whether they're still at it.
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
          await prisma.checkIn.create({
            data: { userId: checkIn.userId, type: "OUT", location: checkIn.location, confidence: null, createdAt: outAt },
          });
          await prisma.activityLog.create({
            data: {
              userId: checkIn.userId,
              action: "CHECK_OUT",
              details: `Auto checked out at ${FALLBACK_QUIT_HOUR}:00 — no response by midnight`,
            },
          });
          revalidatePath(`/users/${checkIn.userId}`);
          revalidatePath("/attendance");
          autoCheckedOut++;
          return;
        }

        const elapsedMs = nowMs - checkIn.createdAt.getTime();

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
