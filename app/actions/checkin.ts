"use server";

import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { buildDailySummary } from "@/lib/attendance";
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

/** Full history, grouped by employee + calendar day, with worked/OT hours.
 *  Always derived fresh from every CheckIn record, so it naturally keeps
 *  growing with past data instead of resetting each time it's requested. */
export async function getDailyAttendanceSummary({
  page = 1,
  limit = 50,
}: { page?: number; limit?: number } = {}): Promise<
  | { success: true; data: DailyAttendanceSummaryRow[]; totalPages: number }
  | { success: false; error: string }
> {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return { success: false, error: "Unauthorized" };

    const rows = await buildFullDailyAttendanceSummary();
    const totalPages = Math.max(1, Math.ceil(rows.length / limit));
    const paged = rows.slice((page - 1) * limit, page * limit);

    return { success: true, data: paged, totalPages };
  } catch (error) {
    logError("Error building daily attendance summary:", error);
    return { success: false, error: "Failed to build daily attendance summary" };
  }
}

/** Same data as getDailyAttendanceSummary but unpaginated, for CSV export. */
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

export async function getAttendanceLogs({
  page = 1,
  limit = 50,
}: { page?: number; limit?: number } = {}): Promise<
  | { success: true; data: unknown[]; totalPages: number }
  | { success: false; error: string }
> {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return { success: false, error: "Unauthorized" };

    const skip = (page - 1) * limit;
    const [logs, totalCount] = await Promise.all([
      prisma.checkIn.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: { user: { select: { username: true, fullName: true } } },
      }),
      prisma.checkIn.count(),
    ]);

    return {
      success: true,
      data: JSON.parse(JSON.stringify(logs)),
      totalPages: Math.max(1, Math.ceil(totalCount / limit)),
    };
  } catch (error) {
    logError("Error fetching attendance logs:", error);
    return { success: false, error: "Failed to load attendance logs" };
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
        confidence: checkIn.confidence,
      },
    };
  } catch (error) {
    logError("Error recording check-in:", error);
    return { success: false, error: "Failed to record check-in" };
  }
}
