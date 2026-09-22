import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { pushLineMessage } from "@/lib/line";
import { notifyOtManagers } from "@/lib/lineApprovals";
import { realizeOutsideTripOtGrant } from "@/lib/otGrant";
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
// How often to nudge someone on an approved outside-work-trip OT session to
// check in / check out, once they're past the point OT started counting.
const OT_NUDGE_INTERVAL_MS = 60 * 60 * 1000;

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
 * - OUTSIDE, part of a registered outside-work trip (CheckIn.tripId set):
 *   no self-serve ask either — OT counts automatically once 8 worked hours
 *   pass, raising an OtApprovalRequest for an ADMIN/OPERATOR/SENIOR to
 *   approve (see notifyOtManagers). Once approved, an hourly nudge asks
 *   them to check out when done. Still gets a midnight safety-net
 *   auto-checkout (realizing the OtGrant from whatever got approved) so a
 *   forgotten session doesn't run forever.
 * - OUTSIDE, not tied to a trip: unchanged — self-serve ask at 8 worked
 *   hours, plus the midnight-rollover fallback (auto-checkout at 18:00 if
 *   never confirmed, one more re-ask if they did).
 *
 * "Still clocked in" mirrors getUserStatuses()'s definition: their most
 * recent CheckIn of any type is an "IN". reminderSentAt/otPromptSentAt/
 * midnightOtPromptSentAt/otNudgeSentAt on that same CheckIn row make each
 * nudge idempotent across runs.
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
      include: { user: { select: { id: true, lineUserId: true, fullName: true, nickname: true, username: true } } },
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
    let otRequestsCreated = 0;
    let nudged = 0;

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

        // OUTSIDE, registered as part of an outside-work trip — no self-serve
        // ask-continue-OT prompt (OT counts automatically, pending manager
        // approval, instead — see handleOutsideTripConfirm in the LINE
        // webhook). Still gets a safety-net midnight auto-checkout so a
        // forgotten session doesn't run forever, and an hourly nudge once
        // OT is approved.
        if (checkIn.tripId) {
          if (bangkokDateKey(now) !== bangkokDateKey(checkIn.createdAt)) {
            const fallbackQuitTime = bangkokDateAt(checkIn.createdAt, FALLBACK_QUIT_HOUR);
            const outAt = fallbackQuitTime > checkIn.createdAt ? fallbackQuitTime : checkIn.createdAt;
            await autoCheckOut(
              checkIn.userId,
              checkIn.location,
              `Auto checked out at ${FALLBACK_QUIT_HOUR}:00 — outside-work trip, no checkout by midnight`,
              outAt
            );
            await realizeOutsideTripOtGrant(checkIn.id, checkIn.userId);
            revalidatePath("/ot");
            autoCheckedOut++;
            return;
          }

          if (elapsedMs >= EXPECTED_SPAN_MS) {
            const existingRequest = await prisma.otApprovalRequest.findFirst({ where: { checkInId: checkIn.id } });
            if (!existingRequest) {
              const request = await prisma.otApprovalRequest.create({
                data: {
                  userId: checkIn.userId,
                  source: "OUTSIDE_AUTO",
                  checkInId: checkIn.id,
                  tripId: checkIn.tripId,
                  location: checkIn.note,
                },
              });
              const name = checkIn.user.nickname || checkIn.user.fullName || checkIn.user.username;
              await notifyOtManagers(
                request.id,
                `📍 ${name} ทำงานนอกสถานที่เกิน 8 ชั่วโมงแล้ว (${checkIn.note || "-"}) ขออนุมัติ OT ค่ะ`
              );
              revalidatePath("/ot");
              otRequestsCreated++;
            } else if (existingRequest.status === "APPROVED") {
              const lastNudge = checkIn.otNudgeSentAt ?? existingRequest.decidedAt ?? existingRequest.createdAt;
              if (nowMs - lastNudge.getTime() >= OT_NUDGE_INTERVAL_MS) {
                await pushLineMessage(lineUserId, `คุณยังทำงานอยู่ไหมคะ? พิมพ์ "เลิกงานแล้ว" เมื่อเสร็จงานนะคะ 🕐`);
                await prisma.checkIn.update({ where: { id: checkIn.id }, data: { otNudgeSentAt: now } });
                nudged++;
              }
            }
            return;
          }

          if (elapsedMs >= WARNING_THRESHOLD_MS && !checkIn.reminderSentAt) {
            await pushLineMessage(lineUserId, `ใกล้ครบเวลาทำงาน 8 ชั่วโมงแล้วนะคะ อีกประมาณ 15 นาทีค่ะ ⏰`);
            await prisma.checkIn.update({ where: { id: checkIn.id }, data: { reminderSentAt: now } });
            warned++;
          }
          return;
        }

        // OUTSIDE, not tied to a trip — unchanged self-serve ask + midnight fallback.
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

    return NextResponse.json({
      success: true,
      checked: stillWorking.length,
      warned,
      prompted,
      autoCheckedOut,
      midnightPrompted,
      otRequestsCreated,
      nudged,
    });
  } catch (error) {
    logError("Error running check-in reminders:", error);
    return NextResponse.json({ success: false, error: "Reminder run failed" }, { status: 500 });
  }
}
