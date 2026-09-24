"use server";

import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { auth } from "@/auth";
import { createActivityLog } from "./auth";
import { revalidatePath } from "next/cache";
import { isOtManagerRole } from "@/lib/roles";
import { notifyUser } from "@/lib/lineApprovals";
import { grantOtToUser, getOpenCheckIn } from "@/lib/otGrant";
import { buildDailySummary, type CheckInEvent } from "@/lib/attendance";
import { bangkokDayRange, paddedCheckInWindow } from "@/lib/datetime";

export interface OtGrantRow {
  id: string;
  userId: string;
  employeeName: string;
  hours: number;
  reason: string | null;
  grantedById: string;
  grantedByName: string;
  status: string;
  declineReason: string | null;
  createdAt: string;
}

/** Full log of every OT grant made via the LINE "เปิด OT" flow — same
 *  admin/operator audience that can grant it in the first place. */
export async function getOtGrants(limit = 200): Promise<
  { success: true; data: OtGrantRow[] } | { success: false; error: string }
> {
  try {
    const session = await auth();
    if (!isOtManagerRole(session?.user?.role)) {
      return { success: false, error: "Unauthorized" };
    }

    const grants = await prisma.otGrant.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        user: { select: { username: true, fullName: true, nickname: true } },
        grantedBy: { select: { username: true, fullName: true, nickname: true } },
      },
    });

    return {
      success: true,
      data: grants.map((g) => ({
        id: g.id,
        userId: g.userId,
        employeeName: g.user.nickname || g.user.fullName || g.user.username,
        hours: g.hours,
        reason: g.reason,
        grantedById: g.grantedById,
        grantedByName: g.grantedBy.nickname || g.grantedBy.fullName || g.grantedBy.username,
        status: g.status,
        declineReason: g.declineReason,
        createdAt: g.createdAt.toISOString(),
      })),
    };
  } catch (error) {
    logError("Error fetching OT grants:", error);
    return { success: false, error: "Failed to load OT grants" };
  }
}

/** Removes an OT grant entirely (e.g. a mistaken/test entry) — admin-only,
 *  stricter than just viewing the log. Also undoes its CheckIn/WorkSchedule
 *  side effects, the same way a decline does, but only if they still look
 *  like this exact grant (not since superseded by something newer). */
export async function deleteOtGrant(id: string) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return { success: false, error: "Unauthorized" };

    const grant = await prisma.otGrant.findUnique({ where: { id } });
    if (!grant) return { success: false, error: "ไม่พบรายการนี้" };

    await prisma.$transaction(async (tx) => {
      if (grant.checkInId) {
        const checkIn = await tx.checkIn.findUnique({ where: { id: grant.checkInId } });
        if (
          checkIn &&
          checkIn.type === "IN" &&
          checkIn.otGrantedById === grant.grantedById &&
          checkIn.otGrantedHours === grant.hours
        ) {
          await tx.checkIn.update({
            where: { id: checkIn.id },
            data: { otGrantedHours: null, otGrantedById: null, otGrantedAt: null },
          });
        }
      }

      if (grant.workScheduleId) {
        await tx.workSchedule.deleteMany({ where: { id: grant.workScheduleId } });
      }

      await tx.otGrant.delete({ where: { id } });
    });

    await createActivityLog("DELETE_OT_GRANT", `Deleted OT grant ${id}`);

    revalidatePath("/attendance");
    revalidatePath("/work-schedule");
    revalidatePath("/ot");
    return { success: true };
  } catch (error) {
    logError("Error deleting OT grant:", error);
    return { success: false, error: "ลบรายการไม่สำเร็จ" };
  }
}

export interface OtApprovalRequestRow {
  id: string;
  userId: string;
  employeeName: string;
  source: string;
  location: string | null;
  reason: string | null;
  requestedHours: number | null;
  createdAt: string;
}

/** Pending (not yet decided) OT approval requests — self-serve requests and
 *  outside-work-trip auto-requests — for the web approve/reject card on
 *  /ot, mirroring the LINE Quick Reply flow for admins who aren't on LINE. */
export async function getPendingOtApprovalRequests(): Promise<
  { success: true; data: OtApprovalRequestRow[] } | { success: false; error: string }
> {
  try {
    const session = await auth();
    if (!isOtManagerRole(session?.user?.role)) {
      return { success: false, error: "Unauthorized" };
    }

    const requests = await prisma.otApprovalRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { username: true, fullName: true, nickname: true } } },
    });

    return {
      success: true,
      data: requests.map((r) => ({
        id: r.id,
        userId: r.userId,
        employeeName: r.user.nickname || r.user.fullName || r.user.username,
        source: r.source,
        location: r.location,
        reason: r.reason,
        requestedHours: r.requestedHours,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  } catch (error) {
    logError("Error fetching OT approval requests:", error);
    return { success: false, error: "Failed to load pending OT requests" };
  }
}

/** Web equivalent of tapping ✅/❌ on the LINE approval push — same
 *  status-guarded update, same grant-on-approve behavior for a SELF_REQUEST
 *  with known hours, same notify-the-employee follow-up. */
export async function decideOtApprovalRequest(id: string, decision: "APPROVE" | "REJECT") {
  try {
    const session = await auth();
    if (!isOtManagerRole(session?.user?.role) || !session?.user?.id) {
      return { success: false, error: "Unauthorized" };
    }

    const status = decision === "APPROVE" ? "APPROVED" : "REJECTED";
    const result = await prisma.otApprovalRequest.updateMany({
      where: { id, status: "PENDING" },
      data: { status, decidedById: session.user.id, decidedAt: new Date() },
    });
    if (result.count === 0) {
      return { success: false, error: "คำขอนี้มีคนดำเนินการไปแล้ว" };
    }

    const request = await prisma.otApprovalRequest.findUnique({ where: { id } });
    if (!request) return { success: false, error: "ไม่พบคำขอนี้" };

    if (decision === "APPROVE" && request.source === "SELF_REQUEST" && request.requestedHours) {
      const openCheckIn = await getOpenCheckIn(request.userId);
      if (openCheckIn && openCheckIn.location === "OFFICE") {
        await grantOtToUser({
          userId: request.userId,
          hours: request.requestedHours,
          reason: request.reason || "คำขอ OT จากพนักงาน",
          grantedById: session.user.id,
          openCheckIn,
        });
      }
    }

    await createActivityLog(
      decision === "APPROVE" ? "APPROVE_OT_REQUEST" : "REJECT_OT_REQUEST",
      `${decision === "APPROVE" ? "Approved" : "Rejected"} OT request ${id}`
    );

    revalidatePath("/ot");
    revalidatePath("/attendance");
    revalidatePath("/work-schedule");

    await notifyUser(
      request.userId,
      `${decision === "APPROVE" ? "✅" : "❌"} คำขอ OT ของคุณ${request.requestedHours ? ` (${request.requestedHours} ชม.)` : ""} ${decision === "APPROVE" ? "ได้รับการอนุมัติแล้ว" : "ถูกปฏิเสธ"}ค่ะ`
    );

    return { success: true };
  } catch (error) {
    logError("Error deciding OT approval request:", error);
    return { success: false, error: "ดำเนินการไม่สำเร็จ" };
  }
}

export interface OtSummaryRow {
  userId: string;
  employeeName: string;
  daysWorked: number;
  totalHours: number;
  totalOtHours: number;
  /** Days with otHours > 3 — the "gets a meal" threshold (web-only badge, no notification). */
  mealEligibleDays: number;
  /** Sum of ACCEPTED OtGrant.hours in range — the formally-granted figure, for
   *  comparing against totalOtHours (the raw computed figure from actual scan times). */
  formalOtHours: number;
}

/** Per-employee days-worked/OT rollup for a date range — the /ot/summary
 *  page. Reuses buildDailySummary the same way getAttendanceTableRows does
 *  (computed from each user's *entire* check-in history so overnight
 *  sessions pair correctly, then filtered down to the requested range). */
export async function getOtSummary({ from, to }: { from?: string; to?: string }): Promise<
  { success: true; data: OtSummaryRow[] } | { success: false; error: string }
> {
  try {
    const session = await auth();
    if (!isOtManagerRole(session?.user?.role)) {
      return { success: false, error: "Unauthorized" };
    }

    const users = await prisma.user.findMany({
      select: { id: true, username: true, fullName: true, nickname: true },
    });

    const allCheckIns = await prisma.checkIn.findMany({
      where: { createdAt: paddedCheckInWindow(from, to) },
      orderBy: { createdAt: "asc" },
      select: { userId: true, type: true, location: true, createdAt: true, otStartOverride: true },
    });

    const byUser = new Map<string, CheckInEvent[]>();
    for (const c of allCheckIns) {
      if (!byUser.has(c.userId)) byUser.set(c.userId, []);
      byUser.get(c.userId)!.push(c);
    }

    const createdAtFilter: { gte?: Date; lt?: Date } = {};
    if (from) createdAtFilter.gte = bangkokDayRange(from).start;
    if (to) createdAtFilter.lt = bangkokDayRange(to).end;

    const grants = await prisma.otGrant.groupBy({
      by: ["userId"],
      where: {
        status: "ACCEPTED",
        ...(Object.keys(createdAtFilter).length > 0 ? { createdAt: createdAtFilter } : {}),
      },
      _sum: { hours: true },
    });
    const formalOtByUser = new Map(grants.map((g) => [g.userId, g._sum.hours || 0]));

    const data: OtSummaryRow[] = [];
    for (const user of users) {
      const events = byUser.get(user.id);
      if (!events || events.length === 0) continue;

      const daily = buildDailySummary(events).filter(
        (d) => (!from || d.dateKey >= from) && (!to || d.dateKey <= to)
      );
      if (daily.length === 0) continue;

      data.push({
        userId: user.id,
        employeeName: user.nickname || user.fullName || user.username,
        daysWorked: daily.filter((d) => d.totalHours > 0).length,
        totalHours: daily.reduce((sum, d) => sum + d.totalHours, 0),
        totalOtHours: daily.reduce((sum, d) => sum + d.otHours, 0),
        mealEligibleDays: daily.filter((d) => d.otHours > 3).length,
        formalOtHours: formalOtByUser.get(user.id) || 0,
      });
    }

    data.sort((a, b) => b.totalOtHours - a.totalOtHours);

    return { success: true, data };
  } catch (error) {
    logError("Error building OT summary:", error);
    return { success: false, error: "Failed to build OT summary" };
  }
}
