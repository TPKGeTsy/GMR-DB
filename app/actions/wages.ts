"use server";

import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { logError } from "@/lib/logger";
import { auth } from "@/auth";
import { createActivityLog } from "./auth";
import { revalidatePath } from "next/cache";
import { bangkokDayRange } from "@/lib/datetime";
import { buildDailyWages, type WageGradeRate, type DailyWageRow } from "@/lib/wages";

/** Sets or clears (null) an employee's intern pay grade. Separate from
 *  updateUserRole — grade only affects wage calculation, not app
 *  permissions, and is intentionally admin-only since it drives payroll. */
export async function updateUserInternGrade(userId: string, grade: string | null) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return { success: false, error: "Unauthorized" };

    if (grade !== null) {
      const exists = await prisma.wageGrade.findUnique({ where: { code: grade } });
      if (!exists) return { success: false, error: "ไม่พบเกรดนี้ในระบบ" };
    }

    const user = await prisma.user.update({ where: { id: userId }, data: { internGrade: grade } });

    await createActivityLog("UPDATE_INTERN_GRADE", `Set intern grade for ${user.username} to ${grade ?? "(none)"}`);

    revalidatePath(`/users/${userId}`);
    revalidatePath("/users");
    revalidatePath("/wages");
    return { success: true };
  } catch (error) {
    logError("Error updating intern grade:", error);
    return { success: false, error: "แก้ไขเกรดไม่สำเร็จ" };
  }
}

export interface WageGradeRow {
  id: string;
  code: string;
  onsiteRate: number;
  outsideRate: number;
}

export async function getWageGrades(): Promise<
  { success: true; data: WageGradeRow[] } | { success: false; error: string }
> {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return { success: false, error: "Unauthorized" };

    const grades = await prisma.wageGrade.findMany({ orderBy: { sortOrder: "asc" } });
    return {
      success: true,
      data: grades.map((g) => ({ id: g.id, code: g.code, onsiteRate: g.onsiteRate, outsideRate: g.outsideRate })),
    };
  } catch (error) {
    logError("Error fetching wage grades:", error);
    return { success: false, error: "โหลดรายการเกรดไม่สำเร็จ" };
  }
}

/** Adds a new pay grade (e.g. "A+", "S") — the admin-facing escape hatch for
 *  grades beyond the original fixed A/B/C, per how this feature grew from a
 *  hardcoded 3-tier system into an open list. */
export async function createWageGrade(data: { code: string; onsiteRate: number; outsideRate: number }) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return { success: false, error: "Unauthorized" };

    const code = data.code.trim();
    if (!code) return { success: false, error: "กรุณาระบุชื่อเกรด" };
    if (!Number.isFinite(data.onsiteRate) || data.onsiteRate < 0 || !Number.isFinite(data.outsideRate) || data.outsideRate < 0) {
      return { success: false, error: "อัตราค่าแรงไม่ถูกต้อง" };
    }

    const maxSort = await prisma.wageGrade.aggregate({ _max: { sortOrder: true } });

    await prisma.wageGrade.create({
      data: {
        code,
        onsiteRate: data.onsiteRate,
        outsideRate: data.outsideRate,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
    });

    await createActivityLog("CREATE_WAGE_GRADE", `Created wage grade ${code} (onsite ${data.onsiteRate}, outside ${data.outsideRate})`);

    revalidatePath("/wages");
    revalidatePath("/users");
    return { success: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { success: false, error: "มีเกรดนี้อยู่แล้ว" };
    }
    logError("Error creating wage grade:", error);
    return { success: false, error: "เพิ่มเกรดไม่สำเร็จ" };
  }
}

/** Rates only — `code` is immutable after creation so renaming can't orphan
 *  the users already assigned to it (they're linked by the code string, not
 *  a foreign key; see the WageGrade model comment in schema.prisma). */
export async function updateWageGrade(id: string, data: { onsiteRate: number; outsideRate: number }) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return { success: false, error: "Unauthorized" };

    if (!Number.isFinite(data.onsiteRate) || data.onsiteRate < 0 || !Number.isFinite(data.outsideRate) || data.outsideRate < 0) {
      return { success: false, error: "อัตราค่าแรงไม่ถูกต้อง" };
    }

    const grade = await prisma.wageGrade.update({ where: { id }, data });

    await createActivityLog("UPDATE_WAGE_GRADE", `Updated wage grade ${grade.code} (onsite ${grade.onsiteRate}, outside ${grade.outsideRate})`);

    revalidatePath("/wages");
    return { success: true };
  } catch (error) {
    logError("Error updating wage grade:", error);
    return { success: false, error: "บันทึกเกรดไม่สำเร็จ" };
  }
}

/** Blocked if any employee currently has this grade — deleting it out from
 *  under them would silently strand their `internGrade` string pointing at
 *  nothing, since it's not a real foreign key. */
export async function deleteWageGrade(id: string) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return { success: false, error: "Unauthorized" };

    const grade = await prisma.wageGrade.findUnique({ where: { id } });
    if (!grade) return { success: false, error: "ไม่พบเกรดนี้" };

    const inUse = await prisma.user.count({ where: { internGrade: grade.code } });
    if (inUse > 0) {
      return { success: false, error: `ลบไม่ได้ ยังมีพนักงาน ${inUse} คนอยู่เกรดนี้` };
    }

    await prisma.wageGrade.delete({ where: { id } });

    await createActivityLog("DELETE_WAGE_GRADE", `Deleted wage grade ${grade.code}`);

    revalidatePath("/wages");
    revalidatePath("/users");
    return { success: true };
  } catch (error) {
    logError("Error deleting wage grade:", error);
    return { success: false, error: "ลบเกรดไม่สำเร็จ" };
  }
}

export interface EmployeeWageReportRow {
  userId: string;
  employeeName: string;
  grade: string;
  days: DailyWageRow[];
  totalDays: number;
  outsideDays: number;
  totalOtHours: number;
  totalOtPay: number;
  totalWage: number;
}

/** Per-employee wage totals over a date range, for every graded intern who
 *  had at least one check-in in range — the wage report's data source. A
 *  user whose grade string no longer matches any WageGrade (the grade was
 *  deleted after they were assigned it) is silently excluded rather than
 *  guessing a rate for them. */
export async function getWageReport({ from, to }: { from: string; to: string }): Promise<
  { success: true; data: EmployeeWageReportRow[] } | { success: false; error: string }
> {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return { success: false, error: "Unauthorized" };

    const { start } = bangkokDayRange(from);
    const { end } = bangkokDayRange(to);

    const [activeUsers, grades] = await Promise.all([
      prisma.user.findMany({
        where: { internGrade: { not: null }, checkIns: { some: { createdAt: { gte: start, lt: end } } } },
        select: { id: true, username: true, fullName: true, nickname: true, internGrade: true },
      }),
      prisma.wageGrade.findMany(),
    ]);

    const gradeByCode = new Map<string, WageGradeRate>(
      grades.map((g) => [g.code, { code: g.code, onsiteRate: g.onsiteRate, outsideRate: g.outsideRate }])
    );

    // Each active user's *full* check-in history, not just this range — a
    // session that started inside the range but crosses midnight past `to`
    // (or started just before `from`) needs its whole pair to compute hours
    // correctly, the same reasoning as the day-panel fix in getDaySummary.
    const userIds = activeUsers.map((u) => u.id);
    const fullHistory = userIds.length
      ? await prisma.checkIn.findMany({
          where: { userId: { in: userIds } },
          orderBy: { createdAt: "asc" },
          select: { userId: true, type: true, location: true, createdAt: true, note: true },
        })
      : [];
    const historyByUser = new Map<string, typeof fullHistory>();
    for (const c of fullHistory) {
      if (!historyByUser.has(c.userId)) historyByUser.set(c.userId, []);
      historyByUser.get(c.userId)!.push(c);
    }

    const data: EmployeeWageReportRow[] = activeUsers
      .filter((u) => u.internGrade && gradeByCode.has(u.internGrade))
      .map((u) => {
        const gradeRate = gradeByCode.get(u.internGrade!)!;
        const allDays = buildDailyWages(historyByUser.get(u.id) || [], gradeRate);
        const days = allDays.filter((d) => d.dateKey >= from && d.dateKey <= to);
        return {
          userId: u.id,
          employeeName: u.nickname || u.fullName || u.username,
          grade: gradeRate.code,
          days,
          totalDays: days.length,
          outsideDays: days.filter((d) => d.wentOutside).length,
          totalOtHours: days.reduce((sum, d) => sum + d.otHours, 0),
          totalOtPay: days.reduce((sum, d) => sum + d.otPay, 0),
          totalWage: days.reduce((sum, d) => sum + d.rate, 0),
        };
      });
    data.sort((a, b) => a.employeeName.localeCompare(b.employeeName));

    return { success: true, data };
  } catch (error) {
    logError("Error building wage report:", error);
    return { success: false, error: "โหลดรายงานค่าแรงไม่สำเร็จ" };
  }
}
