"use server";

import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { auth } from "@/auth";
import { createActivityLog } from "./auth";
import { revalidatePath } from "next/cache";
import { pushLineMessage } from "@/lib/line";
import { checkRateLimit } from "@/lib/rateLimit";

export interface OutsideTripEmployeeOption {
  id: string;
  name: string;
}

export async function getOutsideTripEmployeeOptions(): Promise<
  { success: true; data: OutsideTripEmployeeOption[] } | { success: false; error: string }
> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };

    const users = await prisma.user.findMany({
      orderBy: { username: "asc" },
      select: { id: true, username: true, fullName: true, nickname: true },
    });

    return { success: true, data: users.map((u) => ({ id: u.id, name: u.nickname || u.fullName || u.username })) };
  } catch (error) {
    logError("Error fetching outside-trip employee options:", error);
    return { success: false, error: "โหลดรายชื่อพนักงานไม่สำเร็จ" };
  }
}

/** Starts a group outside-work trip from the web app — any logged-in
 *  employee, same as the LINE bot's flow (field decisions are often made on
 *  the ground, not by a manager). Mirrors handleOutsideTripConfirm in
 *  app/api/line/webhook/route.ts: auto-closes anyone's already-open session
 *  (OFFICE or a previous OUTSIDE trip — a person can only have one open
 *  session at a time), then opens a fresh OUTSIDE one tagged with the trip. */
export async function startOutsideWorkTrip(location: string, memberIds: string[]) {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "กรุณาเข้าสู่ระบบก่อน" };

    const trimmedLocation = location.trim();
    if (!trimmedLocation) return { success: false, error: "กรุณาระบุสถานที่" };

    const rateLimit = await checkRateLimit(`startOutsideWorkTrip:${session.user.id}`, { maxAttempts: 10, windowMs: 60_000 });
    if (!rateLimit.allowed) {
      return { success: false, error: `ลองใหม่ถี่เกินไป กรุณารออีก ${rateLimit.retryAfterSeconds} วินาที` };
    }

    // The requester is always on the trip, even if they didn't tick their own name.
    const uniqueIds = Array.from(new Set([session.user.id, ...memberIds]));
    const members = await prisma.user.findMany({ where: { id: { in: uniqueIds } } });
    if (members.length === 0) return { success: false, error: "ไม่พบพนักงานที่เลือก" };

    await prisma.$transaction(async (tx) => {
      const created = await tx.outsideWorkTrip.create({ data: { location: trimmedLocation, createdById: session.user!.id! } });

      for (const member of members) {
        const latest = await tx.checkIn.findFirst({ where: { userId: member.id }, orderBy: { createdAt: "desc" } });
        if (latest?.type === "IN") {
          await tx.checkIn.create({
            data: {
              userId: member.id,
              type: "OUT",
              location: latest.location,
              confidence: null,
              note: `เปลี่ยนเป็นทำงานนอกสถานที่ (${trimmedLocation})`,
            },
          });
        }
        const checkIn = await tx.checkIn.create({
          data: { userId: member.id, type: "IN", location: "OUTSIDE", confidence: null, note: trimmedLocation, tripId: created.id },
        });
        await tx.outsideWorkTripMember.create({
          data: { tripId: created.id, userId: member.id, checkInId: checkIn.id },
        });
      }
    });

    const names = members.map((m) => m.nickname || m.fullName || m.username).join(", ");
    await createActivityLog("START_OUTSIDE_TRIP", `Started outside trip to "${trimmedLocation}" — members: ${names}`);

    const requesterName = session.user.name || session.user.username;
    await Promise.all(
      members
        .filter((m) => m.id !== session.user!.id && m.lineUserId)
        .map((m) => pushLineMessage(m.lineUserId!, `${requesterName} บันทึกให้คุณไปทำงานนอกสถานที่ที่ "${trimmedLocation}" ค่ะ 📍`))
    );

    revalidatePath("/attendance");
    revalidatePath("/work-schedule");
    revalidatePath("/dashboard");

    return { success: true };
  } catch (error) {
    logError("Error starting outside work trip:", error);
    return { success: false, error: "บันทึกออกหน้างานไม่สำเร็จ" };
  }
}

export interface OutsideTripMemberRow {
  userId: string;
  name: string;
  outAt: string;
  backAt: string | null;
}

export interface OutsideTripRow {
  id: string;
  location: string;
  createdAt: string;
  members: OutsideTripMemberRow[];
}

/** Recent group outside-work trips (both the LINE bot flow and the web
 *  /outside-trip page create OutsideWorkTrip rows the same way), with each
 *  member's actual departure time (their tagged IN) and return time (the
 *  next OUT after it, if they've checked back in yet) — for the Work
 *  Schedule page's "who went where" section. */
export async function getRecentOutsideTrips({ days = 14 }: { days?: number } = {}): Promise<
  { success: true; data: OutsideTripRow[] } | { success: false; error: string }
> {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return { success: false, error: "Unauthorized" };

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const trips = await prisma.outsideWorkTrip.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      include: { members: { include: { user: { select: { id: true, username: true, fullName: true, nickname: true } } } } },
    });

    const checkInIds = trips.flatMap((t) => t.members.map((m) => m.checkInId).filter((id): id is string => !!id));
    const inCheckIns = checkInIds.length
      ? await prisma.checkIn.findMany({ where: { id: { in: checkInIds } }, select: { id: true, createdAt: true } })
      : [];
    const inById = new Map(inCheckIns.map((c) => [c.id, c.createdAt]));

    const memberUserIds = Array.from(new Set(trips.flatMap((t) => t.members.map((m) => m.userId))));
    const allOuts = memberUserIds.length
      ? await prisma.checkIn.findMany({
          where: { userId: { in: memberUserIds }, type: "OUT" },
          orderBy: { createdAt: "asc" },
          select: { userId: true, createdAt: true },
        })
      : [];
    const outsByUser = new Map<string, Date[]>();
    for (const c of allOuts) {
      if (!outsByUser.has(c.userId)) outsByUser.set(c.userId, []);
      outsByUser.get(c.userId)!.push(c.createdAt);
    }
    const nextOutAfter = (userId: string, after: Date): Date | null =>
      (outsByUser.get(userId) || []).find((d) => d.getTime() > after.getTime()) ?? null;

    const data: OutsideTripRow[] = trips.map((trip) => ({
      id: trip.id,
      location: trip.location,
      createdAt: trip.createdAt.toISOString(),
      members: trip.members.map((m) => {
        const outAt = (m.checkInId ? inById.get(m.checkInId) : undefined) ?? trip.createdAt;
        const backAt = nextOutAfter(m.userId, outAt);
        return {
          userId: m.userId,
          name: m.user.nickname || m.user.fullName || m.user.username,
          outAt: outAt.toISOString(),
          backAt: backAt ? backAt.toISOString() : null,
        };
      }),
    }));

    return { success: true, data };
  } catch (error) {
    logError("Error fetching recent outside trips:", error);
    return { success: false, error: "โหลดข้อมูลทริปไม่สำเร็จ" };
  }
}
