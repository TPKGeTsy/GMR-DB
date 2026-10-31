import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { pushLineMessage } from "@/lib/line";
import { bangkokDateKey, bangkokDayRange } from "@/lib/datetime";
import { addDays, eveningTaskMessage, type EveningTask } from "@/lib/projectTasks";

export const dynamic = "force-dynamic";

/**
 * The evening LINE summary of planned duties (project Gantt): what each person finished today, what is past its
 * date, what is still open today and what starts tomorrow. Ping it once a day after work (about 17:30) from the
 * same external cron service as the other /api/cron/* jobs. Needs CRON_SECRET (it sends messages).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const now = new Date();
    const todayKey = bangkokDateKey(now);
    const { start } = bangkokDayRange(todayKey);
    const rows = await prisma.projectTask.findMany({
      where: {
        project: { status: "ACTIVE" },
        user: { lineUserId: { not: null } },
        OR: [
          { doneAt: null, endKey: { gte: addDays(todayKey, -60) }, startKey: { lte: addDays(todayKey, 1) } },
          { doneAt: { gte: start } },
        ],
      },
      orderBy: { startKey: "asc" },
      select: {
        userId: true,
        duty: true,
        note: true,
        startKey: true,
        endKey: true,
        doneAt: true,
        project: { select: { name: true } },
        user: { select: { lineUserId: true } },
      },
    });

    const byUser = new Map<string, { lineUserId: string; tasks: EveningTask[] }>();
    for (const r of rows) {
      if (!r.user.lineUserId) continue;
      const entry = byUser.get(r.userId) ?? { lineUserId: r.user.lineUserId, tasks: [] };
      entry.tasks.push({
        projectName: r.project.name,
        duty: r.duty,
        note: r.note,
        startKey: r.startKey,
        endKey: r.endKey,
        doneKey: r.doneAt ? bangkokDateKey(r.doneAt) : null,
      });
      byUser.set(r.userId, entry);
    }

    let sent = 0;
    for (const { lineUserId, tasks } of byUser.values()) {
      const text = eveningTaskMessage(tasks, todayKey);
      if (!text) continue;
      try {
        await pushLineMessage(lineUserId, text);
        sent++;
      } catch (error) {
        logError("Evening task summary push failed:", error);
      }
    }
    return NextResponse.json({ success: true, sent });
  } catch (error) {
    logError("Error in task evening summary:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
