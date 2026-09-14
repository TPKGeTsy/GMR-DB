import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { pushLineMessage } from "@/lib/line";

const WORK_MS = 8 * 60 * 60 * 1000;
// Lunch isn't tracked as a separate check-out/check-in here — employees stay
// checked in straight through it — so 8 worked hours corresponds to 9 hours
// of raw elapsed time since check-in, not 8.
const LUNCH_BREAK_MS = 60 * 60 * 1000;
const EXPECTED_SPAN_MS = WORK_MS + LUNCH_BREAK_MS;
const WARNING_BEFORE_MS = 15 * 60 * 1000;
const WARNING_THRESHOLD_MS = EXPECTED_SPAN_MS - WARNING_BEFORE_MS;

/**
 * Meant to run every few minutes (see README/setup notes — Vercel's Hobby
 * plan only allows once-daily cron, so this is triggered by an external
 * pinger instead of vercel.json). For everyone still clocked in with a
 * linked LINE account, nudges them ~15 minutes before 8 worked hours
 * (accounting for the untracked lunch break), then again once they're hit
 * asking if they're finishing up or doing OT.
 *
 * "Still clocked in" mirrors getUserStatuses()'s definition: their most
 * recent CheckIn of any type is an "IN". reminderSentAt/otPromptSentAt on
 * that same CheckIn row make each nudge idempotent across runs.
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

    const now = Date.now();
    let warned = 0;
    let prompted = 0;

    await Promise.all(
      stillWorking.map(async (checkIn) => {
        const elapsedMs = now - checkIn.createdAt.getTime();
        const lineUserId = checkIn.user.lineUserId!;

        if (elapsedMs >= EXPECTED_SPAN_MS && !checkIn.otPromptSentAt) {
          await pushLineMessage(
            lineUserId,
            `ครบเวลาทำงาน 8 ชั่วโมงแล้วค่ะ ✨ วันนี้จะเลิกงานหรือทำ OT ต่อดีคะ?`,
            [
              { label: "เลิกงานแล้ว", text: "เลิกงานแล้ว" },
              { label: "ทำ OT ต่อ", text: "ทำ OT ต่อ" },
            ]
          );
          await prisma.checkIn.update({ where: { id: checkIn.id }, data: { otPromptSentAt: new Date() } });
          prompted++;
          return;
        }

        if (elapsedMs >= WARNING_THRESHOLD_MS && elapsedMs < EXPECTED_SPAN_MS && !checkIn.reminderSentAt) {
          await pushLineMessage(lineUserId, `ใกล้ครบเวลาทำงาน 8 ชั่วโมงแล้วนะคะ อีกประมาณ 15 นาทีค่ะ ⏰`);
          await prisma.checkIn.update({ where: { id: checkIn.id }, data: { reminderSentAt: new Date() } });
          warned++;
        }
      })
    );

    return NextResponse.json({ success: true, checked: stillWorking.length, warned, prompted });
  } catch (error) {
    logError("Error running check-in reminders:", error);
    return NextResponse.json({ success: false, error: "Reminder run failed" }, { status: 500 });
  }
}
