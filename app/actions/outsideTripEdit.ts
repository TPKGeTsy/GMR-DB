"use server";

import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { auth } from "@/auth";
import { createActivityLog } from "./auth";
import { revalidatePath } from "next/cache";

export interface OutsideTripEditInput {
  location: string;
  members: {
    userId: string;
    /** ISO instant of the departure scan */
    outAt: string;
    /** ISO instant of the return scan; null = leave as is / still out */
    backAt: string | null;
  }[];
}

/** Admin edit of a trip from its detail page: the place name, and each
 *  member's departure / return time. Times live on the CheckIn rows (the
 *  tagged IN, and the next OUT after it), so editing them here also fixes
 *  Attendance and the wage report. A return time for someone still marked
 *  "ยังไม่กลับ" creates the OUT scan; clearing a return time is not
 *  supported (use Attendance for that). */
export async function updateOutsideTripDetails(id: string, input: OutsideTripEditInput) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return { success: false, error: "Unauthorized" };

    const location = input.location.trim();
    if (!location) return { success: false, error: "กรุณาระบุสถานที่" };

    const trip = await prisma.outsideWorkTrip.findUnique({ where: { id }, include: { members: { include: { user: true } } } });
    if (!trip) return { success: false, error: "ไม่พบทริปนี้" };

    // Resolve every change up front (and validate) before writing anything.
    const plans: {
      userId: string;
      inId: string | null;
      outAt: Date;
      backAt: Date | null;
      backId: string | null;
    }[] = [];

    for (const m of input.members) {
      const member = trip.members.find((x) => x.userId === m.userId);
      if (!member) return { success: false, error: "พบสมาชิกที่ไม่ได้อยู่ในทริปนี้" };
      const name = member.user.nickname || member.user.fullName || member.user.username;

      const outAt = new Date(m.outAt);
      if (isNaN(outAt.getTime())) return { success: false, error: `เวลาออกของ ${name} ไม่ถูกต้อง` };

      const inRow = member.checkInId ? await prisma.checkIn.findUnique({ where: { id: member.checkInId } }) : null;
      const originalOut = inRow?.createdAt ?? trip.createdAt;
      // The return scan is the first OUT after the ORIGINAL departure — the
      // same rule the detail page uses to show "→ time".
      const nextOut = await prisma.checkIn.findFirst({
        where: { userId: m.userId, type: "OUT", createdAt: { gt: originalOut } },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });

      let backAt: Date | null = null;
      if (m.backAt) {
        backAt = new Date(m.backAt);
        if (isNaN(backAt.getTime())) return { success: false, error: `เวลากลับของ ${name} ไม่ถูกต้อง` };
        if (backAt.getTime() <= outAt.getTime()) return { success: false, error: `เวลากลับของ ${name} ต้องหลังเวลาออก` };
      }

      plans.push({ userId: m.userId, inId: member.checkInId, outAt, backAt, backId: nextOut?.id ?? null });
    }

    await prisma.$transaction(async (tx) => {
      if (location !== trip.location) {
        await tx.outsideWorkTrip.update({ where: { id }, data: { location } });
        const inIds = trip.members.map((m) => m.checkInId).filter((x): x is string => !!x);
        // The tagged IN scans carry the place name as their note — keep in sync.
        await tx.checkIn.updateMany({ where: { id: { in: inIds }, note: trip.location }, data: { note: location } });
      }
      for (const p of plans) {
        if (p.inId) await tx.checkIn.update({ where: { id: p.inId }, data: { createdAt: p.outAt } });
        if (p.backAt) {
          if (p.backId) {
            await tx.checkIn.update({ where: { id: p.backId }, data: { createdAt: p.backAt } });
          } else {
            await tx.checkIn.create({
              data: {
                userId: p.userId,
                type: "OUT",
                location: "OUTSIDE",
                confidence: null,
                note: `กลับจาก ${location} (แก้ไขโดยแอดมิน)`,
                createdAt: p.backAt,
              },
            });
          }
        }
      }
    });

    await createActivityLog(
      "EDIT_OUTSIDE_TRIP",
      `Admin edited outside trip "${trip.location}"${location !== trip.location ? ` -> "${location}"` : ""} (${plans.length} member time(s) saved)`
    );

    revalidatePath(`/outside-trip/${id}`);
    revalidatePath("/outside-trip");
    revalidatePath("/work-schedule");
    revalidatePath("/attendance");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    logError("Error updating outside trip details:", error);
    return { success: false, error: "แก้ไขทริปไม่สำเร็จ" };
  }
}
