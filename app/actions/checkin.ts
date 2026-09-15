"use server";

import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { buildDailySummary } from "@/lib/attendance";
import { bangkokDateKey } from "@/lib/datetime";
import { saveDataUrlImage } from "@/lib/storage";
import { checkRateLimit } from "@/lib/rateLimit";

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
}: { page?: number; limit?: number } = {}): Promise<
  | { success: true; data: AttendanceTableRow[]; totalPages: number }
  | { success: false; error: string }
> {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return { success: false, error: "Unauthorized" };

    const skip = (page - 1) * limit;
    const [logs, totalCount, allCheckIns] = await Promise.all([
      prisma.checkIn.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: { user: { select: { username: true, fullName: true } } },
      }),
      prisma.checkIn.count(),
      prisma.checkIn.findMany({
        orderBy: { createdAt: "asc" },
        select: { userId: true, type: true, location: true, createdAt: true },
      }),
    ]);

    const byUser = new Map<string, { type: string; location: string; createdAt: Date }[]>();
    for (const c of allCheckIns) {
      if (!byUser.has(c.userId)) byUser.set(c.userId, []);
      byUser.get(c.userId)!.push(c);
    }

    const dailyLookup = new Map<string, Map<string, { totalHours: number; otHours: number; stillWorking: boolean }>>();
    for (const [userId, events] of byUser) {
      const dayMap = new Map(
        buildDailySummary(events).map((d) => [
          d.dateKey,
          { totalHours: d.totalHours, otHours: d.otHours, stillWorking: d.stillWorking },
        ])
      );
      dailyLookup.set(userId, dayMap);
    }

    const data: AttendanceTableRow[] = logs.map((log) => {
      const dateKey = bangkokDateKey(log.createdAt);
      const daily = dailyLookup.get(log.userId)?.get(dateKey);
      return {
        id: log.id,
        dateKey,
        employeeName: log.user.fullName || log.user.username,
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
