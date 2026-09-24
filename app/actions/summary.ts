"use server";

import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { auth } from "@/auth";
import { bangkokDateKey, bangkokDayRange } from "@/lib/datetime";
import { buildDailySummary } from "@/lib/attendance";
import { countMealDays } from "@/lib/wages";

export interface EmployeeMealOtSummaryRow {
  userId: string;
  employeeName: string;
  totalDays: number;
  totalOtHours: number;
  mealDays: number;
}

/** Per-employee OT hours + accumulated meal count over a date range, for
 *  everyone who had at least one check-in in range — the /summary page's
 *  data source. Fetches each active employee's *full* check-in history
 *  (not just the range) before computing daily totals, same reasoning as
 *  the wage report and Attendance day-panel fixes: a session crossing the
 *  range's edge needs its whole pair to compute hours correctly, then the
 *  resulting per-day rows are filtered down to the requested range. */
export async function getMealOtSummary({ from, to }: { from: string; to: string }): Promise<
  { success: true; data: EmployeeMealOtSummaryRow[] } | { success: false; error: string }
> {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return { success: false, error: "Unauthorized" };

    const { start } = bangkokDayRange(from);
    const { end } = bangkokDayRange(to);

    const activeUsers = await prisma.user.findMany({
      where: { checkIns: { some: { createdAt: { gte: start, lt: end } } } },
      select: { id: true, username: true, fullName: true, nickname: true },
    });

    const userIds = activeUsers.map((u) => u.id);
    const fullHistory = userIds.length
      ? await prisma.checkIn.findMany({
          where: { userId: { in: userIds } },
          orderBy: { createdAt: "asc" },
          select: { userId: true, type: true, location: true, createdAt: true, mealCounted: true, otStartOverride: true },
        })
      : [];
    const historyByUser = new Map<string, typeof fullHistory>();
    for (const c of fullHistory) {
      if (!historyByUser.has(c.userId)) historyByUser.set(c.userId, []);
      historyByUser.get(c.userId)!.push(c);
    }

    const data: EmployeeMealOtSummaryRow[] = activeUsers.map((u) => {
      const events = historyByUser.get(u.id) || [];
      const dailyRows = buildDailySummary(events).filter((r) => r.dateKey >= from && r.dateKey <= to);
      const eventsInRange = events.filter((e) => {
        const dateKey = bangkokDateKey(e.createdAt);
        return dateKey >= from && dateKey <= to;
      });
      return {
        userId: u.id,
        employeeName: u.nickname || u.fullName || u.username,
        totalDays: dailyRows.length,
        totalOtHours: dailyRows.reduce((sum, r) => sum + r.otHours, 0),
        mealDays: countMealDays(eventsInRange),
      };
    });
    data.sort((a, b) => a.employeeName.localeCompare(b.employeeName));

    return { success: true, data };
  } catch (error) {
    logError("Error building meal/OT summary:", error);
    return { success: false, error: "โหลดสรุปไม่สำเร็จ" };
  }
}
