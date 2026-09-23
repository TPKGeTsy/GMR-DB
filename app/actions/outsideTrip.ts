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
