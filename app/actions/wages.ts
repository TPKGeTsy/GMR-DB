"use server";

import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { auth } from "@/auth";
import { createActivityLog } from "./auth";
import { revalidatePath } from "next/cache";
import { bangkokDayRange } from "@/lib/datetime";
import { buildDailyWages, type InternGrade, type WageSettingsValues, type DailyWageRow } from "@/lib/wages";

const VALID_GRADES = ["A", "B", "C"];

/** Sets or clears (null) an employee's intern pay grade. Separate from
 *  updateUserRole — grade only affects wage calculation, not app
 *  permissions, and is intentionally admin-only since it drives payroll. */
export async function updateUserInternGrade(userId: string, grade: string | null) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return { success: false, error: "Unauthorized" };
    if (grade !== null && !VALID_GRADES.includes(grade)) return { success: false, error: "เกรดไม่ถูกต้อง" };

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

// Falls back to these defaults (matching the schema's column defaults) when
// no row has been saved yet — only `updateWageSettings` ever writes the row,
// so concurrent reads (e.g. this page's settings panel + report loading in
// parallel) never race each other trying to create it.
const DEFAULT_WAGE_SETTINGS: WageSettingsValues = {
  gradeARate: 300,
  gradeBRate: 250,
  gradeCRate: 150,
  outsideFlatRate: 300,
  gradeAOutsideAllowance: 0,
};

async function readWageSettings(): Promise<WageSettingsValues> {
  const settings = await prisma.wageSettings.findUnique({ where: { id: 1 } });
  if (!settings) return DEFAULT_WAGE_SETTINGS;
  return {
    gradeARate: settings.gradeARate,
    gradeBRate: settings.gradeBRate,
    gradeCRate: settings.gradeCRate,
    outsideFlatRate: settings.outsideFlatRate,
    gradeAOutsideAllowance: settings.gradeAOutsideAllowance,
  };
}

export async function getWageSettings(): Promise<
  { success: true; data: WageSettingsValues } | { success: false; error: string }
> {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return { success: false, error: "Unauthorized" };

    return { success: true, data: await readWageSettings() };
  } catch (error) {
    logError("Error fetching wage settings:", error);
    return { success: false, error: "โหลดการตั้งค่าไม่สำเร็จ" };
  }
}

export async function updateWageSettings(data: WageSettingsValues) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return { success: false, error: "Unauthorized" };

    for (const [key, value] of Object.entries(data)) {
      if (!Number.isFinite(value) || value < 0) return { success: false, error: `ค่า ${key} ไม่ถูกต้อง` };
    }

    await prisma.wageSettings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });

    await createActivityLog("UPDATE_WAGE_SETTINGS", `Updated wage settings: ${JSON.stringify(data)}`);

    revalidatePath("/wages");
    return { success: true };
  } catch (error) {
    logError("Error updating wage settings:", error);
    return { success: false, error: "บันทึกการตั้งค่าไม่สำเร็จ" };
  }
}

export interface EmployeeWageReportRow {
  userId: string;
  employeeName: string;
  grade: InternGrade;
  days: DailyWageRow[];
  totalDays: number;
  outsideDays: number;
  totalWage: number;
}

/** Per-employee wage totals over a date range, for every graded intern who
 *  had at least one check-in in range — the wage report's data source. */
export async function getWageReport({ from, to }: { from: string; to: string }): Promise<
  { success: true; data: EmployeeWageReportRow[] } | { success: false; error: string }
> {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return { success: false, error: "Unauthorized" };

    const { start } = bangkokDayRange(from);
    const { end } = bangkokDayRange(to);

    const [users, settings] = await Promise.all([
      prisma.user.findMany({
        where: { internGrade: { not: null } },
        select: {
          id: true,
          username: true,
          fullName: true,
          nickname: true,
          internGrade: true,
          checkIns: {
            where: { createdAt: { gte: start, lt: end } },
            select: { location: true, createdAt: true },
          },
        },
      }),
      readWageSettings(),
    ]);

    const data: EmployeeWageReportRow[] = users
      .filter((u) => u.checkIns.length > 0)
      .map((u) => {
        const grade = u.internGrade as InternGrade;
        const days = buildDailyWages(u.checkIns, grade, settings);
        return {
          userId: u.id,
          employeeName: u.nickname || u.fullName || u.username,
          grade,
          days,
          totalDays: days.length,
          outsideDays: days.filter((d) => d.wentOutside).length,
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
