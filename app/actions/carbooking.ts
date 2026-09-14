"use server";

import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { auth } from "@/auth";
import { createActivityLog } from "./auth";
import { revalidatePath } from "next/cache";
import { formatThaiDateTime } from "@/lib/datetime";

function isApprover(role: string | undefined) {
  return role === "ADMIN" || role === "OPERATOR";
}

export async function createBooking(
  vehicleId: string,
  startAt: string,
  endAt: string,
  purpose: string
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "กรุณาเข้าสู่ระบบก่อนจองรถ" };

    const start = new Date(startAt);
    const end = new Date(endAt);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return { success: false, error: "วันเวลาไม่ถูกต้อง" };
    }
    if (end <= start) {
      return { success: false, error: "เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่มต้น" };
    }
    if (start.getTime() < Date.now() - 5 * 60 * 1000) {
      return { success: false, error: "ไม่สามารถจองเวลาที่ผ่านไปแล้วได้" };
    }

    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) return { success: false, error: "ไม่พบรถคันนี้" };
    if (vehicle.status !== "AVAILABLE") {
      return { success: false, error: "รถคันนี้ไม่พร้อมให้จอง (อยู่ระหว่างซ่อมบำรุง)" };
    }

    // Block only against already-approved overlapping bookings — pending
    // requests can coexist and the approver sorts out any conflict.
    const conflict = await prisma.booking.findFirst({
      where: {
        vehicleId,
        status: "APPROVED",
        startAt: { lt: end },
        endAt: { gt: start },
      },
    });
    if (conflict) {
      return { success: false, error: "ช่วงเวลานี้ถูกจองไปแล้ว กรุณาเลือกเวลาอื่น" };
    }

    const booking = await prisma.booking.create({
      data: {
        vehicleId,
        userId: session.user.id,
        startAt: start,
        endAt: end,
        purpose: purpose?.trim() || null,
      },
    });

    await createActivityLog(
      "REQUEST_BOOKING",
      `Requested ${vehicle.name} (${vehicle.licensePlate}) from ${formatThaiDateTime(start)} to ${formatThaiDateTime(end)}`
    );

    revalidatePath("/carbook");
    return { success: true, data: JSON.parse(JSON.stringify(booking)) };
  } catch (error) {
    logError("Error creating booking:", error);
    return { success: false, error: "จองรถไม่สำเร็จ" };
  }
}

export async function approveBooking(bookingId: string) {
  try {
    const session = await auth();
    if (!isApprover(session?.user?.role)) return { success: false, error: "Unauthorized" };

    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: { vehicle: true } });
      if (!booking) throw new Error("ไม่พบคำขอจองนี้");
      if (booking.status !== "PENDING") throw new Error("คำขอนี้ถูกดำเนินการไปแล้ว");

      const updated = await tx.booking.update({
        where: { id: bookingId },
        data: { status: "APPROVED", approvedById: session!.user!.id, decidedAt: new Date() },
      });

      // Auto-reject any other pending requests for the same vehicle that
      // overlap with the now-approved slot — they can no longer be granted.
      await tx.booking.updateMany({
        where: {
          vehicleId: booking.vehicleId,
          status: "PENDING",
          id: { not: bookingId },
          startAt: { lt: booking.endAt },
          endAt: { gt: booking.startAt },
        },
        data: { status: "REJECTED", approvedById: session!.user!.id, decidedAt: new Date() },
      });

      return { updated, vehicleName: booking.vehicle.name };
    });

    await createActivityLog("APPROVE_BOOKING", `Approved booking for ${result.vehicleName}`);

    revalidatePath("/carbook");
    return { success: true };
  } catch (error) {
    logError("Error approving booking:", error);
    const message = error instanceof Error ? error.message : "อนุมัติไม่สำเร็จ";
    return { success: false, error: message };
  }
}

export async function rejectBooking(bookingId: string) {
  try {
    const session = await auth();
    if (!isApprover(session?.user?.role)) return { success: false, error: "Unauthorized" };

    const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { vehicle: true } });
    if (!booking) return { success: false, error: "ไม่พบคำขอจองนี้" };
    if (booking.status !== "PENDING") return { success: false, error: "คำขอนี้ถูกดำเนินการไปแล้ว" };

    await prisma.booking.update({
      where: { id: bookingId },
      data: { status: "REJECTED", approvedById: session!.user!.id, decidedAt: new Date() },
    });

    await createActivityLog("REJECT_BOOKING", `Rejected booking for ${booking.vehicle.name}`);

    revalidatePath("/carbook");
    return { success: true };
  } catch (error) {
    logError("Error rejecting booking:", error);
    return { success: false, error: "ปฏิเสธไม่สำเร็จ" };
  }
}

export async function cancelBooking(bookingId: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };

    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) return { success: false, error: "ไม่พบคำขอจองนี้" };
    if (booking.userId !== session.user.id && session.user.role !== "ADMIN") {
      return { success: false, error: "Unauthorized" };
    }
    if (booking.status !== "PENDING" && booking.status !== "APPROVED") {
      return { success: false, error: "ไม่สามารถยกเลิกคำขอนี้ได้" };
    }

    await prisma.booking.update({
      where: { id: bookingId },
      data: { status: "CANCELLED", decidedAt: new Date() },
    });

    await createActivityLog("CANCEL_BOOKING", `Cancelled booking ${bookingId}`);

    revalidatePath("/carbook");
    return { success: true };
  } catch (error) {
    logError("Error cancelling booking:", error);
    return { success: false, error: "ยกเลิกไม่สำเร็จ" };
  }
}

export async function getMyBookings() {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };

    const bookings = await prisma.booking.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      include: { vehicle: true },
    });

    return { success: true, data: JSON.parse(JSON.stringify(bookings)) };
  } catch (error) {
    logError("Error fetching my bookings:", error);
    return { success: false, error: "Failed to load bookings" };
  }
}

export async function getPendingBookings() {
  try {
    const session = await auth();
    if (!isApprover(session?.user?.role)) return { success: false, error: "Unauthorized" };

    const bookings = await prisma.booking.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: { vehicle: true, user: { select: { username: true, fullName: true } } },
    });

    return { success: true, data: JSON.parse(JSON.stringify(bookings)) };
  } catch (error) {
    logError("Error fetching pending bookings:", error);
    return { success: false, error: "Failed to load pending bookings" };
  }
}

export async function getPendingBookingsCount() {
  try {
    const session = await auth();
    if (!isApprover(session?.user?.role)) return { success: true, data: 0 };

    const count = await prisma.booking.count({ where: { status: "PENDING" } });
    return { success: true, data: count };
  } catch (error) {
    logError("Error counting pending bookings:", error);
    return { success: true, data: 0 };
  }
}

/** Approved bookings that haven't ended yet, soonest first — used to show
 *  "who has a car reserved and when" on the Dashboard and the booking page. */
export async function getUpcomingBookings(limit = 10) {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };

    const bookings = await prisma.booking.findMany({
      where: { status: "APPROVED", endAt: { gte: new Date() } },
      orderBy: { startAt: "asc" },
      take: limit,
      include: { vehicle: true, user: { select: { username: true, fullName: true } } },
    });

    return { success: true, data: JSON.parse(JSON.stringify(bookings)) };
  } catch (error) {
    logError("Error fetching upcoming bookings:", error);
    return { success: false, error: "Failed to load upcoming bookings" };
  }
}
