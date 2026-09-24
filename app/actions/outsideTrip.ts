"use server";

import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { auth } from "@/auth";
import { createActivityLog } from "./auth";
import { revalidatePath } from "next/cache";
import { pushLineMessage } from "@/lib/line";
import { checkRateLimit } from "@/lib/rateLimit";
import { bangkokRangeFilter } from "@/lib/datetime";

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
  createdByName: string;
  report: string | null;
  members: OutsideTripMemberRow[];
}

/** Shared trip-row builder for both getRecentOutsideTrips and
 *  getOutsideTripDetail — same "actual departure / next check-back-in"
 *  time-matching logic either way. */
async function buildOutsideTripRows(
  trips: {
    id: string;
    location: string;
    createdAt: Date;
    report: string | null;
    createdBy: { username: string; fullName: string | null; nickname: string | null };
    members: { userId: string; checkInId: string | null; user: { id: string; username: string; fullName: string | null; nickname: string | null } }[];
  }[]
): Promise<OutsideTripRow[]> {
  const checkInIds = trips.flatMap((t) => t.members.map((m) => m.checkInId).filter((id): id is string => !!id));
  const inCheckIns = checkInIds.length
    ? await prisma.checkIn.findMany({ where: { id: { in: checkInIds } }, select: { id: true, createdAt: true } })
    : [];
  const inById = new Map(inCheckIns.map((c) => [c.id, c.createdAt]));

  // Bounded to a window around these trips instead of each member's entire
  // OUT history — a "next OUT after they left" only ever needs to look a
  // few days past the latest trip in this batch, not scan the whole table.
  const memberUserIds = Array.from(new Set(trips.flatMap((t) => t.members.map((m) => m.userId))));
  const OUT_LOOKAHEAD_DAYS = 3;
  const earliestTrip = trips.reduce((min, t) => (t.createdAt < min ? t.createdAt : min), trips[0]?.createdAt ?? new Date());
  const latestTrip = trips.reduce((max, t) => (t.createdAt > max ? t.createdAt : max), trips[0]?.createdAt ?? new Date());
  const allOuts = memberUserIds.length
    ? await prisma.checkIn.findMany({
        where: {
          userId: { in: memberUserIds },
          type: "OUT",
          createdAt: { gte: earliestTrip, lt: new Date(latestTrip.getTime() + OUT_LOOKAHEAD_DAYS * 24 * 3_600_000) },
        },
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

  return trips.map((trip) => ({
    id: trip.id,
    location: trip.location,
    createdAt: trip.createdAt.toISOString(),
    createdByName: trip.createdBy.nickname || trip.createdBy.fullName || trip.createdBy.username,
    report: trip.report,
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
}

/** Group outside-work trips (both the LINE bot flow and the web
 *  /outside-trip page create OutsideWorkTrip rows the same way), with each
 *  member's actual departure time (their tagged IN) and return time (the
 *  next OUT after it, if they've checked back in yet) — for the Work
 *  Schedule page's "who went where" section and the /outside-trip log.
 *  `from`/`to` (Bangkok calendar dates) filter to that range instead of the
 *  rolling `days` window when given — used by the full trip-log browser. */
export async function getRecentOutsideTrips({
  days = 14,
  from,
  to,
}: { days?: number; from?: string; to?: string } = {}): Promise<
  { success: true; data: OutsideTripRow[] } | { success: false; error: string }
> {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return { success: false, error: "Unauthorized" };

    const createdAtFilter = from || to ? bangkokRangeFilter(from, to) : { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
    const trips = await prisma.outsideWorkTrip.findMany({
      where: { createdAt: createdAtFilter },
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { username: true, fullName: true, nickname: true } },
        members: { include: { user: { select: { id: true, username: true, fullName: true, nickname: true } } } },
      },
    });

    const data = await buildOutsideTripRows(trips);

    return { success: true, data };
  } catch (error) {
    logError("Error fetching recent outside trips:", error);
    return { success: false, error: "โหลดข้อมูลทริปไม่สำเร็จ" };
  }
}

/** One trip's full detail — for the /outside-trip/[id] page that a click on
 *  any "ออกหน้างาน" time link (Attendance day panel, Wage report) lands on. */
export async function getOutsideTripDetail(id: string): Promise<
  { success: true; data: OutsideTripRow } | { success: false; error: string }
> {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return { success: false, error: "Unauthorized" };

    const trip = await prisma.outsideWorkTrip.findUnique({
      where: { id },
      include: {
        createdBy: { select: { username: true, fullName: true, nickname: true } },
        members: { include: { user: { select: { id: true, username: true, fullName: true, nickname: true } } } },
      },
    });
    if (!trip) return { success: false, error: "ไม่พบทริปนี้" };

    const [data] = await buildOutsideTripRows([trip]);
    return { success: true, data };
  } catch (error) {
    logError("Error fetching outside trip detail:", error);
    return { success: false, error: "โหลดข้อมูลทริปไม่สำเร็จ" };
  }
}

/** Sets the trip's follow-up report/notes — the detail page's editable
 *  "หมายเหตุ" field for whatever wasn't captured when the trip was created
 *  (arrival time detail, issues on site, etc.). */
export async function updateOutsideTripReport(id: string, report: string) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return { success: false, error: "Unauthorized" };

    const trip = await prisma.outsideWorkTrip.update({ where: { id }, data: { report: report.trim() || null } });

    await createActivityLog("UPDATE_OUTSIDE_TRIP_REPORT", `Admin updated the report for the "${trip.location}" outside trip`);

    revalidatePath(`/outside-trip/${id}`);
    revalidatePath("/outside-trip");
    revalidatePath("/work-schedule");
    return { success: true };
  } catch (error) {
    logError("Error updating outside trip report:", error);
    return { success: false, error: "บันทึกหมายเหตุไม่สำเร็จ" };
  }
}
