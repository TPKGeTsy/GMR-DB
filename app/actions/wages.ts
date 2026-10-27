"use server";

import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { logError } from "@/lib/logger";
import { auth } from "@/auth";
import { createActivityLog } from "./auth";
import { revalidatePath } from "next/cache";
import { bangkokDateKey, bangkokDayRange, paddedCheckInWindow } from "@/lib/datetime";
import { cleanOtReason } from "@/lib/otReason";
import { DATE_KEY_RE, gradeForDay, type GradeChange } from "@/lib/internGrade";
import { buildDailyWages, type WageGradeRate, type DailyWageRow } from "@/lib/wages";

/** Keeps User.internGrade (used for filtering/display) equal to the grade in
 *  force today according to the history; no history leaves it as is. */
async function syncCurrentGrade(userId: string) {
  const changes = await prisma.internGradeChange.findMany({ where: { userId } });
  if (changes.length === 0) return;
  const current = gradeForDay(changes, bangkokDateKey(new Date()), null);
  await prisma.user.update({ where: { id: userId }, data: { internGrade: current } });
}

function revalidateGradePages(userId: string) {
  revalidatePath(`/users/${userId}`);
  revalidatePath("/users");
  revalidatePath("/wages");
}

/** Sets or clears (null) an employee's intern pay grade *from today on*
 *  (earlier days keep the grade they had). Separate from updateUserRole —
 *  grade only affects wage calculation, not app permissions, and is
 *  intentionally admin-only since it drives payroll. Clearing (null) removes
 *  the person from the intern wage report and drops their grade history. */
export async function updateUserInternGrade(userId: string, grade: string | null) {
  return changeInternGrade(userId, grade, bangkokDateKey(new Date()));
}

/** Same, but from a chosen date ("YYYY-MM-DD") - e.g. A until 31 Aug and A+
 *  from 1 Sep. A second change on the same date replaces the first. */
export async function changeInternGrade(userId: string, grade: string | null, effectiveFrom: string) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return { success: false, error: "Unauthorized" };

    if (grade === null) {
      await prisma.$transaction([
        prisma.internGradeChange.deleteMany({ where: { userId } }),
        prisma.user.update({ where: { id: userId }, data: { internGrade: null } }),
      ]);
      await createActivityLog("UPDATE_INTERN_GRADE", `Cleared intern grade for user ${userId}`);
      revalidateGradePages(userId);
      return { success: true };
    }

    if (!DATE_KEY_RE.test(effectiveFrom)) return { success: false, error: "วันที่ไม่ถูกต้อง" };
    const exists = await prisma.wageGrade.findUnique({ where: { code: grade } });
    if (!exists) return { success: false, error: "ไม่พบเกรดนี้ในระบบ" };

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { internGradeChanges: { select: { id: true } } },
    });
    if (!user) return { success: false, error: "ไม่พบพนักงานคนนี้" };

    // First time with history: keep the grade they already had as the starting
    // point, so work before the new date is still paid at the old grade.
    if (user.internGradeChanges.length === 0 && user.internGrade && user.internGrade !== grade) {
      await prisma.internGradeChange.create({
        data: { userId, grade: user.internGrade, effectiveFrom: "2000-01-01" },
      });
    }
    await prisma.internGradeChange.upsert({
      where: { userId_effectiveFrom: { userId, effectiveFrom } },
      create: { userId, grade, effectiveFrom },
      update: { grade },
    });
    await syncCurrentGrade(userId);

    await createActivityLog("UPDATE_INTERN_GRADE", `Set intern grade for ${user.username} to ${grade} from ${effectiveFrom}`);
    revalidateGradePages(userId);
    return { success: true };
  } catch (error) {
    logError("Error updating intern grade:", error);
    return { success: false, error: "แก้ไขเกรดไม่สำเร็จ" };
  }
}

export interface InternGradeChangeRow {
  id: string;
  grade: string;
  effectiveFrom: string;
}

export async function getInternGradeHistory(
  userId: string
): Promise<{ success: true; data: InternGradeChangeRow[] } | { success: false; error: string }> {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return { success: false, error: "Unauthorized" };
    const rows = await prisma.internGradeChange.findMany({ where: { userId }, orderBy: { effectiveFrom: "desc" } });
    return { success: true, data: rows.map((r) => ({ id: r.id, grade: r.grade, effectiveFrom: r.effectiveFrom })) };
  } catch (error) {
    logError("Error fetching intern grade history:", error);
    return { success: false, error: "โหลดประวัติเกรดไม่สำเร็จ" };
  }
}

export async function deleteInternGradeChange(id: string) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return { success: false, error: "Unauthorized" };
    const row = await prisma.internGradeChange.findUnique({ where: { id } });
    if (!row) return { success: false, error: "ไม่พบรายการนี้" };
    await prisma.internGradeChange.delete({ where: { id } });
    await syncCurrentGrade(row.userId);
    await createActivityLog(
      "DELETE_INTERN_GRADE_CHANGE",
      `Removed grade ${row.grade} from ${row.effectiveFrom} for user ${row.userId}`
    );
    revalidateGradePages(row.userId);
    return { success: true };
  } catch (error) {
    logError("Error deleting intern grade change:", error);
    return { success: false, error: "ลบรายการไม่สำเร็จ" };
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

    const inUse = await prisma.user.count({
      where: { OR: [{ internGrade: grade.code }, { internGradeChanges: { some: { grade: grade.code } } }] },
    });
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
  grade: string; // e.g. "A", or "A → A+" when it changed inside the range
  gradeChanged: boolean;
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
        where: { OR: [{ internGrade: { not: null } }, { internGradeChanges: { some: {} } }], checkIns: { some: { createdAt: { gte: start, lt: end } } } },
        select: {
          id: true,
          username: true,
          fullName: true,
          nickname: true,
          internGrade: true,
          internGradeChanges: { select: { grade: true, effectiveFrom: true } },
        },
      }),
      prisma.wageGrade.findMany(),
    ]);

    const gradeByCode = new Map<string, WageGradeRate>(
      grades.map((g) => [g.code, { code: g.code, onsiteRate: g.onsiteRate, outsideRate: g.outsideRate }])
    );

    // Each active user's check-ins in a padded window around the range, not
    // their *entire* history — a session that started inside the range but
    // crosses midnight past `to` (or started just before `from`) needs its
    // whole pair to compute hours correctly, the same reasoning as the
    // day-panel fix in getDaySummary, but bounded so this doesn't grow into
    // a full-table scan as the check-in table accumulates months of data.
    const userIds = activeUsers.map((u) => u.id);
    const fullHistory = userIds.length
      ? await prisma.checkIn.findMany({
          where: { userId: { in: userIds }, createdAt: paddedCheckInWindow(from, to) },
          orderBy: { createdAt: "asc" },
          select: {
            userId: true,
            type: true,
            location: true,
            createdAt: true,
            note: true,
            outsideStartAt: true,
            outsideEndAt: true,
            tripId: true,
          },
        })
      : [];
    const historyByUser = new Map<string, typeof fullHistory>();
    for (const c of fullHistory) {
      if (!historyByUser.has(c.userId)) historyByUser.set(c.userId, []);
      historyByUser.get(c.userId)!.push(c);
    }

    // Admin overrides of specific (user, day) rates within this range — a
    // day with one has its computed `rate` replaced but keeps baseRate/OT
    // as informational context for why the grade math alone got it wrong.
    const overrides = userIds.length
      ? await prisma.wageOverride.findMany({
          where: { userId: { in: userIds }, dateKey: { gte: from, lte: to } },
        })
      : [];
    const overrideByUserAndDate = new Map(overrides.map((o) => [`${o.userId}|${o.dateKey}`, o]));

    const otReasons = userIds.length
      ? await prisma.otReason.findMany({ where: { userId: { in: userIds }, dateKey: { gte: from, lte: to } } })
      : [];
    const otReasonByUserAndDate = new Map(otReasons.map((r) => [`${r.userId}|${r.dateKey}`, r.reason]));

    const data: EmployeeWageReportRow[] = activeUsers
      .filter((u) => u.internGrade || u.internGradeChanges.length > 0)
      .map((u) => {
        const changes: GradeChange[] = u.internGradeChanges;
        // Each day is priced with the grade in force that day; a day whose
        // grade no longer exists (deleted) is left out rather than guessed.
        const rateFor = (dateKey: string) => {
          const code = gradeForDay(changes, dateKey, u.internGrade);
          return code ? (gradeByCode.get(code) ?? null) : null;
        };
        const allDays = buildDailyWages(historyByUser.get(u.id) || [], rateFor);
        const days = allDays
          .filter((d) => d.dateKey >= from && d.dateKey <= to)
          .map((withoutReason) => {
            const d = { ...withoutReason, otReason: otReasonByUserAndDate.get(`${u.id}|${withoutReason.dateKey}`) ?? null };
            const override = overrideByUserAndDate.get(`${u.id}|${d.dateKey}`);
            if (!override) return d;
            return { ...d, rate: override.rate, overridden: true, originalRate: d.rate, overrideNote: override.note };
          });
        const gradesUsed = Array.from(new Set(days.map((d) => d.grade)));
        const gradeLabel = gradesUsed.length > 0 ? gradesUsed.join(" → ") : (u.internGrade ?? "");
        return {
          userId: u.id,
          employeeName: u.nickname || u.fullName || u.username,
          grade: gradeLabel,
          gradeChanged: gradesUsed.length > 1,
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

/** Sets (upserts) an admin override of one employee's pay for one specific
 *  day — replaces the grade-computed `rate` in the wage report without
 *  touching the underlying check-in data, for the rare case the automatic
 *  in-office/outside + OT math doesn't match what should actually be paid. */
export async function setWageOverride(userId: string, dateKey: string, rate: number, note?: string) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return { success: false, error: "Unauthorized" };

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return { success: false, error: "วันที่ไม่ถูกต้อง" };
    if (!Number.isFinite(rate) || rate < 0) return { success: false, error: "ค่าแรงไม่ถูกต้อง" };

    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) return { success: false, error: "ไม่พบพนักงานคนนี้" };

    await prisma.wageOverride.upsert({
      where: { userId_dateKey: { userId, dateKey } },
      create: { userId, dateKey, rate, note: note?.trim() || null },
      update: { rate, note: note?.trim() || null },
    });

    await createActivityLog(
      "SET_WAGE_OVERRIDE",
      `Admin set ${targetUser.username}'s pay for ${dateKey} to ${rate} บาท${note ? ` (${note})` : ""}`
    );

    revalidatePath("/wages");
    revalidatePath("/attendance");
    revalidatePath(`/users/${userId}`);
    return { success: true };
  } catch (error) {
    logError("Error setting wage override:", error);
    return { success: false, error: "บันทึกค่าแรงไม่สำเร็จ" };
  }
}

export interface WageOverrideRow {
  dateKey: string;
  rate: number;
  note: string | null;
  updatedAt: string;
}

/** One employee's full override history, newest first — for the profile
 *  page's own section, separate from the all-employees /wages report. */
export async function getUserWageOverrides(userId: string): Promise<
  { success: true; data: WageOverrideRow[] } | { success: false; error: string }
> {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return { success: false, error: "Unauthorized" };

    const overrides = await prisma.wageOverride.findMany({
      where: { userId },
      orderBy: { dateKey: "desc" },
    });

    return {
      success: true,
      data: overrides.map((o) => ({
        dateKey: o.dateKey,
        rate: o.rate,
        note: o.note,
        updatedAt: o.updatedAt.toISOString(),
      })),
    };
  } catch (error) {
    logError("Error fetching wage overrides:", error);
    return { success: false, error: "โหลดประวัติค่าแรงที่แก้ไขไม่สำเร็จ" };
  }
}

/** Removes a day's override, reverting it back to the grade-computed rate. */
export async function clearWageOverride(userId: string, dateKey: string) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return { success: false, error: "Unauthorized" };

    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) return { success: false, error: "ไม่พบพนักงานคนนี้" };

    await prisma.wageOverride.deleteMany({ where: { userId, dateKey } });

    await createActivityLog("CLEAR_WAGE_OVERRIDE", `Admin cleared ${targetUser.username}'s pay override for ${dateKey}`);

    revalidatePath("/wages");
    revalidatePath("/attendance");
    revalidatePath(`/users/${userId}`);
    return { success: true };
  } catch (error) {
    logError("Error clearing wage override:", error);
    return { success: false, error: "ลบค่าแรงที่แก้ไขไม่สำเร็จ" };
  }
}

/** Admin sets, changes or (empty text) removes the reason someone stayed for OT
 *  on one day - the same record the check-out prompt writes. */
export async function setOtReason(userId: string, dateKey: string, reason: string | null) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return { success: false, error: "Unauthorized" };
    if (!DATE_KEY_RE.test(dateKey)) return { success: false, error: "วันที่ไม่ถูกต้อง" };

    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) return { success: false, error: "ไม่พบพนักงานคนนี้" };

    const cleaned = cleanOtReason(reason);
    if (cleaned) {
      await prisma.otReason.upsert({
        where: { userId_dateKey: { userId, dateKey } },
        create: { userId, dateKey, reason: cleaned },
        update: { reason: cleaned },
      });
    } else {
      await prisma.otReason.deleteMany({ where: { userId, dateKey } });
    }

    await createActivityLog(
      "SET_OT_REASON",
      cleaned
        ? `Admin set ${targetUser.username}'s OT reason for ${dateKey}: ${cleaned}`
        : `Admin removed ${targetUser.username}'s OT reason for ${dateKey}`
    );

    revalidatePath("/wages");
    revalidatePath(`/users/${userId}`);
    return { success: true };
  } catch (error) {
    logError("Error setting OT reason:", error);
    return { success: false, error: "บันทึกเหตุผล OT ไม่สำเร็จ" };
  }
}
