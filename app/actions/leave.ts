"use server";

import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { auth } from "@/auth";
import { createActivityLog } from "./auth";
import { revalidatePath } from "next/cache";
import { formatThaiDate } from "@/lib/datetime";

const LEAVE_TYPES = ["SICK", "PERSONAL", "VACATION"] as const;
type LeaveType = (typeof LEAVE_TYPES)[number];

function isApprover(role: string | undefined) {
  return role === "ADMIN" || role === "OPERATOR";
}

export async function createLeaveRequest(
  type: string,
  startDate: string,
  endDate: string,
  reason: string
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "กรุณาเข้าสู่ระบบก่อนยื่นใบลา" };

    if (!LEAVE_TYPES.includes(type as LeaveType)) {
      return { success: false, error: "ประเภทการลาไม่ถูกต้อง" };
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return { success: false, error: "วันที่ไม่ถูกต้อง" };
    }
    if (end < start) {
      return { success: false, error: "วันที่สิ้นสุดต้องอยู่หลังวันที่เริ่มต้น" };
    }

    const leaveRequest = await prisma.leaveRequest.create({
      data: {
        userId: session.user.id,
        type,
        startDate: start,
        endDate: end,
        reason: reason?.trim() || null,
      },
    });

    await createActivityLog(
      "REQUEST_LEAVE",
      `Requested ${type} leave from ${formatThaiDate(start)} to ${formatThaiDate(end)}`
    );

    revalidatePath("/leave");
    return { success: true, data: JSON.parse(JSON.stringify(leaveRequest)) };
  } catch (error) {
    logError("Error creating leave request:", error);
    return { success: false, error: "ยื่นใบลาไม่สำเร็จ" };
  }
}

export async function approveLeaveRequest(leaveRequestId: string) {
  try {
    const session = await auth();
    if (!isApprover(session?.user?.role)) return { success: false, error: "Unauthorized" };

    const leaveRequest = await prisma.leaveRequest.findUnique({ where: { id: leaveRequestId } });
    if (!leaveRequest) return { success: false, error: "ไม่พบคำขอลานี้" };
    if (leaveRequest.status !== "PENDING") return { success: false, error: "คำขอนี้ถูกดำเนินการไปแล้ว" };

    await prisma.leaveRequest.update({
      where: { id: leaveRequestId },
      data: { status: "APPROVED", approvedById: session!.user!.id, decidedAt: new Date() },
    });

    await createActivityLog("APPROVE_LEAVE", `Approved leave request ${leaveRequestId}`);

    revalidatePath("/leave");
    return { success: true };
  } catch (error) {
    logError("Error approving leave request:", error);
    return { success: false, error: "อนุมัติไม่สำเร็จ" };
  }
}

export async function rejectLeaveRequest(leaveRequestId: string) {
  try {
    const session = await auth();
    if (!isApprover(session?.user?.role)) return { success: false, error: "Unauthorized" };

    const leaveRequest = await prisma.leaveRequest.findUnique({ where: { id: leaveRequestId } });
    if (!leaveRequest) return { success: false, error: "ไม่พบคำขอลานี้" };
    if (leaveRequest.status !== "PENDING") return { success: false, error: "คำขอนี้ถูกดำเนินการไปแล้ว" };

    await prisma.leaveRequest.update({
      where: { id: leaveRequestId },
      data: { status: "REJECTED", approvedById: session!.user!.id, decidedAt: new Date() },
    });

    await createActivityLog("REJECT_LEAVE", `Rejected leave request ${leaveRequestId}`);

    revalidatePath("/leave");
    return { success: true };
  } catch (error) {
    logError("Error rejecting leave request:", error);
    return { success: false, error: "ปฏิเสธไม่สำเร็จ" };
  }
}

export async function cancelLeaveRequest(leaveRequestId: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };

    const leaveRequest = await prisma.leaveRequest.findUnique({ where: { id: leaveRequestId } });
    if (!leaveRequest) return { success: false, error: "ไม่พบคำขอลานี้" };
    if (leaveRequest.userId !== session.user.id && session.user.role !== "ADMIN") {
      return { success: false, error: "Unauthorized" };
    }
    if (leaveRequest.status !== "PENDING" && leaveRequest.status !== "APPROVED") {
      return { success: false, error: "ไม่สามารถยกเลิกคำขอนี้ได้" };
    }

    await prisma.leaveRequest.update({
      where: { id: leaveRequestId },
      data: { status: "CANCELLED", decidedAt: new Date() },
    });

    await createActivityLog("CANCEL_LEAVE", `Cancelled leave request ${leaveRequestId}`);

    revalidatePath("/leave");
    return { success: true };
  } catch (error) {
    logError("Error cancelling leave request:", error);
    return { success: false, error: "ยกเลิกไม่สำเร็จ" };
  }
}

export async function getMyLeaveRequests() {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };

    const leaveRequests = await prisma.leaveRequest.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });

    return { success: true, data: JSON.parse(JSON.stringify(leaveRequests)) };
  } catch (error) {
    logError("Error fetching my leave requests:", error);
    return { success: false, error: "Failed to load leave requests" };
  }
}

export async function getPendingLeaveRequests() {
  try {
    const session = await auth();
    if (!isApprover(session?.user?.role)) return { success: false, error: "Unauthorized" };

    const leaveRequests = await prisma.leaveRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { username: true, fullName: true } } },
    });

    return { success: true, data: JSON.parse(JSON.stringify(leaveRequests)) };
  } catch (error) {
    logError("Error fetching pending leave requests:", error);
    return { success: false, error: "Failed to load pending leave requests" };
  }
}

export async function getPendingLeaveRequestsCount() {
  try {
    const session = await auth();
    if (!isApprover(session?.user?.role)) return { success: true, data: 0 };

    const count = await prisma.leaveRequest.count({ where: { status: "PENDING" } });
    return { success: true, data: count };
  } catch (error) {
    logError("Error counting pending leave requests:", error);
    return { success: true, data: 0 };
  }
}
