"use server";

import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { auth } from "@/auth";
import { createActivityLog } from "./auth";
import { revalidatePath } from "next/cache";
import { buildDailySummary } from "@/lib/attendance";
import { bangkokDateKey, bangkokDayRange, bangkokDateAt } from "@/lib/datetime";
import { saveDataUrlImage } from "@/lib/storage";
import { checkRateLimit } from "@/lib/rateLimit";
import { pushLineMessage } from "@/lib/line";

// "เช็คอินก่อน 9.00 เกิน 45 นาที" — more than 45 min before 9:00, i.e. at or
// before 8:15.
const EARLY_CHECKIN_CUTOFF_HOUR = 8;
const EARLY_CHECKIN_CUTOFF_MINUTE = 15;

export async function registerFace(userId: string, descriptor: number[], consented: boolean) {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };
    if (session.user.role !== "ADMIN" && session.user.id !== userId) {
      return { success: false, error: "Unauthorized" };
    }

    if (!Array.isArray(descriptor) || descriptor.length === 0) {
      return { success: false, error: "Invalid face data" };
    }

    if (!consented) {
      return { success: false, error: "ต้องยืนยันความยินยอมในการเก็บข้อมูลใบหน้าก่อน" };
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { faceDescriptor: descriptor, faceRegisteredAt: new Date(), faceConsentAt: new Date() },
    });

    await prisma.activityLog.create({
      data: {
        userId: session.user.id!,
        action: "REGISTER_FACE",
        details: `Registered face for user ${user.username}`,
      },
    });

    revalidatePath(`/users/${userId}`);
    return { success: true };
  } catch (error) {
    logError("Error registering face:", error);
    return { success: false, error: "Failed to register face" };
  }
}

export async function removeFace(userId: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };
    if (session.user.role !== "ADMIN" && session.user.id !== userId) {
      return { success: false, error: "Unauthorized" };
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { faceDescriptor: [], faceRegisteredAt: null, faceConsentAt: null },
    });

    await prisma.activityLog.create({
      data: {
        userId: session.user.id!,
        action: "REMOVE_FACE",
        details: `Removed registered face for user ${user.username}`,
      },
    });

    revalidatePath(`/users/${userId}`);
    return { success: true };
  } catch (error) {
    logError("Error removing face:", error);
    return { success: false, error: "Failed to remove face" };
  }
}

export async function getFaceRoster() {
  try {
    const users = await prisma.user.findMany({
      where: { faceDescriptor: { isEmpty: false } },
      select: { id: true, username: true, fullName: true, faceDescriptor: true },
    });

    return {
      success: true,
      data: users.map((u) => ({
        id: u.id,
        name: u.fullName || u.username,
        descriptor: u.faceDescriptor,
      })),
    };
  } catch (error) {
    logError("Error fetching face roster:", error);
    return { success: false, error: "Failed to load roster" };
  }
}

export async function getUserStatuses() {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return { success: false, error: "Unauthorized" };

    const latest = await prisma.checkIn.findMany({
      orderBy: { createdAt: "desc" },
      distinct: ["userId"],
      select: { userId: true, type: true, location: true, createdAt: true },
    });

    const statuses: Record<
      string,
      { online: boolean; location: string; since: string }
    > = {};
    for (const c of latest) {
      statuses[c.userId] = {
        online: c.type === "IN",
        location: c.location,
        since: c.createdAt.toISOString(),
      };
    }

    return { success: true, data: statuses };
  } catch (error) {
    logError("Error fetching user statuses:", error);
    return { success: false, error: "Failed to load user statuses" };
  }
}

export interface DailyAttendanceSummaryRow {
  userId: string;
  name: string;
  dateKey: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  stillWorking: boolean;
  totalHours: number;
  regularHours: number;
  otHours: number;
}

/** Builds the full daily summary (every employee, every day) — used as the
 *  source for both the paginated on-page table and the CSV export, so the
 *  two always agree. */
async function buildFullDailyAttendanceSummary(): Promise<DailyAttendanceSummaryRow[]> {
  const checkIns = await prisma.checkIn.findMany({
    orderBy: { createdAt: "asc" },
    include: { user: { select: { id: true, username: true, fullName: true } } },
  });

  const byUser = new Map<
    string,
    { name: string; events: { type: string; location: string; createdAt: Date }[] }
  >();
  for (const c of checkIns) {
    if (!byUser.has(c.userId)) {
      byUser.set(c.userId, { name: c.user.fullName || c.user.username, events: [] });
    }
    byUser.get(c.userId)!.events.push({ type: c.type, location: c.location, createdAt: c.createdAt });
  }

  const rows: DailyAttendanceSummaryRow[] = [];
  for (const [userId, { name, events }] of byUser) {
    for (const day of buildDailySummary(events)) {
      rows.push({
        userId,
        name,
        dateKey: day.dateKey,
        startTime: day.startTime ? day.startTime.toISOString() : null,
        endTime: day.endTime ? day.endTime.toISOString() : null,
        location: day.location,
        stillWorking: day.stillWorking,
        totalHours: day.totalHours,
        regularHours: day.regularHours,
        otHours: day.otHours,
      });
    }
  }

  rows.sort((a, b) => b.dateKey.localeCompare(a.dateKey) || a.name.localeCompare(b.name));
  return rows;
}

/** Unpaginated daily summary (every employee, every day), for CSV export. */
export async function getFullDailyAttendanceSummary(): Promise<
  { success: true; data: DailyAttendanceSummaryRow[] } | { success: false; error: string }
> {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return { success: false, error: "Unauthorized" };

    return { success: true, data: await buildFullDailyAttendanceSummary() };
  } catch (error) {
    logError("Error building daily attendance summary:", error);
    return { success: false, error: "Failed to build daily attendance summary" };
  }
}

export interface AttendanceTableRow {
  id: string;
  dateKey: string;
  employeeId: string;
  employeeName: string;
  time: string;
  type: string;
  location: string;
  note: string | null;
  confidence: number | null;
  photoUrl: string | null;
  dailyTotalHours: number | null;
  dailyOtHours: number | null;
  stillWorking: boolean;
}

/** One row per raw check-in/out scan, augmented with that employee's
 *  computed totals for the same calendar day — lets the admin table offer
 *  both "per scan" detail (time, confidence, photo) and "per day" totals
 *  (hours, OT) as columns the admin can toggle, from a single dataset. */
export async function getAttendanceTableRows({
  page = 1,
  limit = 50,
  from,
  to,
  type,
  otOnly,
}: {
  page?: number;
  limit?: number;
  /** Bangkok calendar dates (YYYY-MM-DD), inclusive on both ends. */
  from?: string;
  to?: string;
  type?: "IN" | "OUT";
  /** Only rows on a day where that employee's computed dailyOtHours > 0. */
  otOnly?: boolean;
} = {}): Promise<
  | { success: true; data: AttendanceTableRow[]; totalPages: number }
  | { success: false; error: string }
> {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return { success: false, error: "Unauthorized" };

    const skip = (page - 1) * limit;

    const createdAtFilter: { gte?: Date; lt?: Date } = {};
    if (from) createdAtFilter.gte = bangkokDayRange(from).start;
    if (to) createdAtFilter.lt = bangkokDayRange(to).end;

    const baseWhere = {
      ...(Object.keys(createdAtFilter).length > 0 ? { createdAt: createdAtFilter } : {}),
      ...(type ? { type } : {}),
    };

    const allCheckInsQuery = () =>
      prisma.checkIn.findMany({
        orderBy: { createdAt: "asc" },
        select: { userId: true, type: true, location: true, createdAt: true, otStartOverride: true },
      });
    const logsQuery = (where: typeof baseWhere) =>
      prisma.checkIn.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: { user: { select: { username: true, fullName: true, nickname: true } } },
      });

    // otOnly needs the full unfiltered history fetched *before* logs/totalCount
    // can run, since it decides which days qualify for the `where` clause
    // below — but that's the uncommon path. The plain view's `where` never
    // depends on allCheckIns, so keep it running concurrently with
    // logs/totalCount like before, rather than serializing every request
    // behind a full-table scan (which is what allCheckIns always is).
    let allCheckIns: Awaited<ReturnType<typeof allCheckInsQuery>>;
    let logs: Awaited<ReturnType<typeof logsQuery>>;
    let totalCount: number;

    if (otOnly) {
      allCheckIns = await allCheckInsQuery();
      logs = [];
      totalCount = 0;
    } else {
      [allCheckIns, logs, totalCount] = await Promise.all([
        allCheckInsQuery(),
        logsQuery(baseWhere),
        prisma.checkIn.count({ where: baseWhere }),
      ]);
    }

    const byUser = new Map<string, { type: string; location: string; createdAt: Date; otStartOverride: Date | null }[]>();
    for (const c of allCheckIns) {
      if (!byUser.has(c.userId)) byUser.set(c.userId, []);
      byUser.get(c.userId)!.push(c);
    }

    const dailyLookup = new Map<string, Map<string, { totalHours: number; otHours: number; stillWorking: boolean }>>();
    // (userId, dateKey) pairs with OT hours, within the from/to window if
    // given — what an otOnly filter is built from below.
    const otDays: { userId: string; dateKey: string }[] = [];
    for (const [userId, events] of byUser) {
      const dayMap = new Map(
        buildDailySummary(events).map((d) => [
          d.dateKey,
          { totalHours: d.totalHours, otHours: d.otHours, stillWorking: d.stillWorking },
        ])
      );
      dailyLookup.set(userId, dayMap);
      if (otOnly) {
        for (const [dateKey, d] of dayMap) {
          if (d.otHours > 0 && (!from || dateKey >= from) && (!to || dateKey <= to)) {
            otDays.push({ userId, dateKey });
          }
        }
      }
    }

    if (otOnly) {
      // Filters only narrow which rows are *displayed* (`logs`/`totalCount`) —
      // dailyLookup above stays keyed off the unfiltered allCheckIns.
      const where = {
        ...baseWhere,
        OR:
          otDays.length > 0
            ? otDays.map(({ userId, dateKey }) => {
                const { start, end } = bangkokDayRange(dateKey);
                return { userId, createdAt: { gte: start, lt: end } };
              })
            : [{ id: "__no_ot_days__" }], // no OT days in range — show nothing, not everything
      };

      [logs, totalCount] = await Promise.all([logsQuery(where), prisma.checkIn.count({ where })]);
    }

    const data: AttendanceTableRow[] = logs.map((log) => {
      const dateKey = bangkokDateKey(log.createdAt);
      const daily = dailyLookup.get(log.userId)?.get(dateKey);
      return {
        id: log.id,
        dateKey,
        employeeId: log.userId,
        employeeName: log.user.nickname || log.user.fullName || log.user.username,
        time: log.createdAt.toISOString(),
        type: log.type,
        location: log.location,
        note: log.note,
        confidence: log.confidence,
        photoUrl: log.photoUrl,
        dailyTotalHours: daily?.totalHours ?? null,
        dailyOtHours: daily?.otHours ?? null,
        stillWorking: daily?.stillWorking ?? false,
      };
    });

    return { success: true, data, totalPages: Math.max(1, Math.ceil(totalCount / limit)) };
  } catch (error) {
    logError("Error building attendance table rows:", error);
    return { success: false, error: "Failed to load attendance table" };
  }
}

export async function recordCheckIn(
  userId: string,
  confidence: number,
  type: "IN" | "OUT",
  location: "OFFICE" | "OUTSIDE",
  note?: string,
  photoDataUrl?: string
) {
  try {
    if (type !== "IN" && type !== "OUT") {
      return { success: false, error: "Invalid check-in type" };
    }
    if (location !== "OFFICE" && location !== "OUTSIDE") {
      return { success: false, error: "Invalid location" };
    }

    const rateLimit = await checkRateLimit(`checkin:${userId}`, { maxAttempts: 10, windowMs: 60_000 });
    if (!rateLimit.allowed) {
      return { success: false, error: `แสกนถี่เกินไป กรุณารออีก ${rateLimit.retryAfterSeconds} วินาที` };
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return { success: false, error: "Unknown user" };

    const latest = await prisma.checkIn.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
    const isCurrentlyCheckedIn = latest?.type === "IN";
    if (type === "IN" && isCurrentlyCheckedIn) {
      return { success: false, error: "คุณเช็คอินอยู่แล้ว กรุณาเช็คเอาท์ก่อนเช็คอินใหม่" };
    }
    if (type === "OUT" && !isCurrentlyCheckedIn) {
      return { success: false, error: "คุณยังไม่ได้เช็คอิน ไม่สามารถเช็คเอาท์ได้" };
    }

    const trimmedNote = note?.trim() || null;

    let photoUrl: string | null = null;
    if (photoDataUrl) {
      try {
        photoUrl = await saveDataUrlImage(photoDataUrl, "checkins");
      } catch (photoError) {
        // A failed snapshot upload shouldn't block the check-in itself.
        logError("Error saving check-in photo:", photoError, { userId });
      }
    }

    const checkIn = await prisma.checkIn.create({
      data: { userId, confidence, type, location, note: trimmedNote, photoUrl },
    });

    const actionLabel = type === "IN" ? "Started work" : "Finished work";
    const locationLabel = location === "OUTSIDE" ? ` (Outside office${trimmedNote ? `: ${trimmedNote}` : ""})` : "";

    await prisma.activityLog.create({
      data: {
        userId,
        action: type === "IN" ? "CHECK_IN" : "CHECK_OUT",
        details: `${actionLabel}${locationLabel} — confidence ${(confidence * 100).toFixed(1)}%`,
      },
    });

    // More than 45 min before 9:00 (at/before 8:15) — ask whether there's
    // actual work to do this early, or they just came in ahead of time.
    // "มีงาน" is audit-only (hours already count from the true check-in
    // time); "แค่มาก่อน" sets otStartOverride so the early idle time
    // doesn't count as worked/OT time (see lib/attendance.ts).
    if (type === "IN" && location === "OFFICE" && user.lineUserId) {
      const cutoff = bangkokDateAt(checkIn.createdAt, EARLY_CHECKIN_CUTOFF_HOUR, EARLY_CHECKIN_CUTOFF_MINUTE);
      if (checkIn.createdAt < cutoff) {
        await pushLineMessage(
          user.lineUserId,
          "สวัสดีค่ะ ☀️ เช็คอินเร็วกว่าปกตินะคะ มีงานที่ต้องเริ่มทำเลยไหมคะ หรือแค่มาก่อนเวลาเฉยๆ?",
          [
            { label: "มีงาน", text: `EARLY_HAS_WORK:${checkIn.id}` },
            { label: "แค่มาก่อน", text: `EARLY_JUST_EARLY:${checkIn.id}` },
          ]
        );
      }
    }

    revalidatePath(`/users/${userId}`);
    revalidatePath("/attendance");

    return {
      success: true,
      data: {
        id: checkIn.id,
        name: user.fullName || user.username,
        type: checkIn.type,
        location: checkIn.location,
        note: checkIn.note,
        createdAt: checkIn.createdAt.toISOString(),
        confidence,
      },
    };
  } catch (error) {
    logError("Error recording check-in:", error);
    return { success: false, error: "Failed to record check-in" };
  }
}

/** Which Bangkok calendar days in a given month had any check-in activity —
 *  lets the attendance calendar mark days worth clicking without fetching
 *  full day detail for all 28-31 of them up front. `month` is 1-12. */
export async function getMonthActivity(
  year: number,
  month: number
): Promise<{ success: true; data: string[] } | { success: false; error: string }> {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return { success: false, error: "Unauthorized" };

    const startKey = `${year}-${String(month).padStart(2, "0")}-01`;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const endKey = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

    const { start } = bangkokDayRange(startKey);
    const { start: end } = bangkokDayRange(endKey);

    const checkIns = await prisma.checkIn.findMany({
      where: { createdAt: { gte: start, lt: end } },
      select: { createdAt: true },
    });

    const dateKeys = new Set(checkIns.map((c) => bangkokDateKey(c.createdAt)));
    return { success: true, data: Array.from(dateKeys) };
  } catch (error) {
    logError("Error fetching month activity:", error);
    return { success: false, error: "Failed to load month activity" };
  }
}

export interface DaySummaryEvent {
  type: string;
  time: string;
  location: string;
  confidence: number | null;
  note: string | null;
}

export interface DaySummaryRow {
  userId: string;
  employeeName: string;
  events: DaySummaryEvent[];
  totalHours: number;
  otHours: number;
  stillWorking: boolean;
  openSince: string | null;
}

export interface DayLoanRow {
  id: string;
  assetName: string;
  quantity: number;
  employeeName: string;
  time: string;
}

/** Everything that happened on one Bangkok calendar day — who was checked in
 *  and when, plus what was borrowed/returned that day — for the attendance
 *  calendar's day-detail panel. */
export async function getDaySummary(dateKey: string): Promise<
  | { success: true; data: { attendance: DaySummaryRow[]; borrowed: DayLoanRow[]; returned: DayLoanRow[] } }
  | { success: false; error: string }
> {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return { success: false, error: "Unauthorized" };

    const { start, end } = bangkokDayRange(dateKey);

    const [checkIns, borrowedLoans, returnedLoans] = await Promise.all([
      prisma.checkIn.findMany({
        where: { createdAt: { gte: start, lt: end } },
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, username: true, fullName: true } } },
      }),
      prisma.loan.findMany({
        where: { borrowedAt: { gte: start, lt: end } },
        include: { user: { select: { username: true, fullName: true } }, asset: { select: { name: true } } },
        orderBy: { borrowedAt: "asc" },
      }),
      prisma.loan.findMany({
        where: { returnedAt: { gte: start, lt: end } },
        include: { user: { select: { username: true, fullName: true } }, asset: { select: { name: true } } },
        orderBy: { returnedAt: "asc" },
      }),
    ]);

    const byUser = new Map<
      string,
      { name: string; events: { type: string; location: string; createdAt: Date; confidence: number | null; note: string | null }[] }
    >();
    for (const c of checkIns) {
      if (!byUser.has(c.userId)) byUser.set(c.userId, { name: c.user.fullName || c.user.username, events: [] });
      byUser.get(c.userId)!.events.push({
        type: c.type,
        location: c.location,
        createdAt: c.createdAt,
        confidence: c.confidence,
        note: c.note,
      });
    }

    const attendance: DaySummaryRow[] = Array.from(byUser.entries()).map(([userId, { name, events }]) => {
      const [daily] = buildDailySummary(events);
      return {
        userId,
        employeeName: name,
        events: events
          .slice()
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .map((e) => ({ type: e.type, time: e.createdAt.toISOString(), location: e.location, confidence: e.confidence, note: e.note })),
        totalHours: daily?.totalHours ?? 0,
        otHours: daily?.otHours ?? 0,
        stillWorking: daily?.stillWorking ?? false,
        openSince: daily?.openSince ? daily.openSince.toISOString() : null,
      };
    });
    attendance.sort((a, b) => a.employeeName.localeCompare(b.employeeName));

    return {
      success: true,
      data: {
        attendance,
        borrowed: borrowedLoans.map((l) => ({
          id: l.id,
          assetName: l.asset.name,
          quantity: l.quantity,
          employeeName: l.user.fullName || l.user.username,
          time: l.borrowedAt.toISOString(),
        })),
        returned: returnedLoans
          .filter((l): l is typeof l & { returnedAt: Date } => l.returnedAt !== null)
          .map((l) => ({
            id: l.id,
            assetName: l.asset.name,
            quantity: l.quantity,
            employeeName: l.user.fullName || l.user.username,
            time: l.returnedAt.toISOString(),
          })),
      },
    };
  } catch (error) {
    logError("Error building day summary:", error);
    return { success: false, error: "Failed to load day summary" };
  }
}

export interface EmployeeOption {
  id: string;
  name: string;
}

/** For the "reassign employee" dropdown on the edit-check-in modal. */
export async function getEmployeeOptions(): Promise<
  { success: true; data: EmployeeOption[] } | { success: false; error: string }
> {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return { success: false, error: "Unauthorized" };

    const users = await prisma.user.findMany({
      orderBy: { username: "asc" },
      select: { id: true, username: true, fullName: true, nickname: true },
    });

    return { success: true, data: users.map((u) => ({ id: u.id, name: u.nickname || u.fullName || u.username })) };
  } catch (error) {
    logError("Error fetching employee options:", error);
    return { success: false, error: "Failed to load employees" };
  }
}

/** Corrects a raw check-in/out scan — who it belongs to, when it happened,
 *  in/out, office/outside, and the note. Exists because the reminder cron
 *  auto-checks people out at exactly 8 worked hours (or a granted OT
 *  deadline) with no way to retroactively extend it — a real overnight
 *  shift that nobody opened enough OT for gets cut short in the data even
 *  though people kept actually working, and this is how an admin fixes
 *  that after the fact. */
export async function updateCheckIn(
  id: string,
  data: { userId?: string; type?: string; location?: string; createdAt?: string; note?: string }
) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return { success: false, error: "Unauthorized" };

    const existing = await prisma.checkIn.findUnique({ where: { id } });
    if (!existing) return { success: false, error: "ไม่พบรายการนี้" };

    const updateData: {
      type?: string;
      location?: string;
      createdAt?: Date;
      note?: string | null;
      userId?: string;
    } = {};

    if (data.type !== undefined) {
      if (data.type !== "IN" && data.type !== "OUT") return { success: false, error: "ประเภทไม่ถูกต้อง" };
      updateData.type = data.type;
    }
    if (data.location !== undefined) {
      if (data.location !== "OFFICE" && data.location !== "OUTSIDE") return { success: false, error: "สถานที่ไม่ถูกต้อง" };
      updateData.location = data.location;
    }
    if (data.createdAt !== undefined) {
      const parsed = new Date(data.createdAt);
      if (isNaN(parsed.getTime())) return { success: false, error: "วันเวลาไม่ถูกต้อง" };
      updateData.createdAt = parsed;
    }
    if (data.note !== undefined) {
      updateData.note = data.note.trim() || null;
    }
    if (data.userId !== undefined && data.userId !== existing.userId) {
      const targetUser = await prisma.user.findUnique({ where: { id: data.userId } });
      if (!targetUser) return { success: false, error: "ไม่พบพนักงานคนนี้" };
      updateData.userId = data.userId;
    }

    const updated = await prisma.checkIn.update({ where: { id }, data: updateData });

    await createActivityLog(
      "EDIT_CHECKIN",
      `Admin edited check-in ${id} (user ${existing.userId} -> ${updated.userId}, ${existing.type}@${existing.createdAt.toISOString()} -> ${updated.type}@${updated.createdAt.toISOString()})`
    );

    revalidatePath("/attendance");
    revalidatePath(`/users/${existing.userId}`);
    if (updated.userId !== existing.userId) revalidatePath(`/users/${updated.userId}`);

    return { success: true, data: JSON.parse(JSON.stringify(updated)) };
  } catch (error) {
    logError("Error updating check-in:", error);
    return { success: false, error: "แก้ไขไม่สำเร็จ" };
  }
}

/** Removes a stray/duplicate scan entirely (e.g. an accidental double-tap
 *  that created two IN rows back to back). */
export async function deleteCheckIn(id: string) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return { success: false, error: "Unauthorized" };

    const existing = await prisma.checkIn.findUnique({ where: { id } });
    if (!existing) return { success: false, error: "ไม่พบรายการนี้" };

    await prisma.checkIn.delete({ where: { id } });

    await createActivityLog(
      "DELETE_CHECKIN",
      `Admin deleted check-in ${id} (user ${existing.userId}, ${existing.type}@${existing.createdAt.toISOString()})`
    );

    revalidatePath("/attendance");
    revalidatePath(`/users/${existing.userId}`);

    return { success: true };
  } catch (error) {
    logError("Error deleting check-in:", error);
    return { success: false, error: "ลบไม่สำเร็จ" };
  }
}
