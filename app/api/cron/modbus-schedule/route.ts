import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { applyChannels } from "@/lib/modbusApply";
import { isDue, bangkokClock, type ScheduleRow } from "@/lib/modbusSchedule";

export const dynamic = "force-dynamic";

/**
 * Runs the timers set on the /modbus "ตั้งเวลา" tab. Ping it every minute from
 * CloudPanel's Cron Jobs (see deploy/crontab.txt):
 *
 *   * * * * *  curl -s -H "Authorization: Bearer <CRON_SECRET>" http://127.0.0.1:3417/api/cron/modbus-schedule
 *
 * Like the auto-off job it REQUIRES CRON_SECRET: it drives physical outputs, so
 * it must never be triggerable without the secret. A schedule fires at its
 * minute, or up to a few minutes late if a tick was missed, and at most once a
 * day (lastRunDateKey). Cheap when idle: one small query.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const rows = await prisma.modbusSchedule.findMany({ where: { enabled: true } });
    const due = rows
      .map(
        (r): ScheduleRow => ({
          id: r.id,
          title: r.title,
          time: r.time,
          days: r.days,
          action: r.action === "OFF" ? "OFF" : "ON",
          channels: r.channels,
          enabled: r.enabled,
          lastRunDateKey: r.lastRunDateKey,
        })
      )
      .filter((s) => isDue(s, now));

    const { dateKey } = bangkokClock(now);
    const ran: { id: string; title: string; action: string; channels: number[] }[] = [];
    const failed: { id: string; channels: number[] }[] = [];

    for (const schedule of due) {
      try {
        const result = await applyChannels(schedule.channels, schedule.action === "ON", "schedule");
        if (result.failed.length === 0) {
          // Only a fully applied schedule counts as run; a failed one is retried next minute (within its window).
          await prisma.modbusSchedule.update({ where: { id: schedule.id }, data: { lastRunDateKey: dateKey } });
          // Channel numbers in the response are 1-based, like the UI.
          ran.push({ id: schedule.id, title: schedule.title, action: schedule.action, channels: schedule.channels.map((c) => c + 1) });
        } else {
          failed.push({ id: schedule.id, channels: result.failed.map((c) => c + 1) });
        }
      } catch (error) {
        logError(`Modbus schedule ${schedule.id} failed:`, error);
        failed.push({ id: schedule.id, channels: schedule.channels.map((c) => c + 1) });
      }
    }

    return NextResponse.json({ success: failed.length === 0, checked: rows.length, ran, failed });
  } catch (error) {
    logError("Modbus schedule run failed:", error);
    return NextResponse.json({ success: false, error: "Schedule run failed" }, { status: 500 });
  }
}
