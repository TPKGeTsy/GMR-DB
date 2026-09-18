"use server";

import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { auth } from "@/auth";
import { createActivityLog } from "./auth";
import { revalidatePath } from "next/cache";

export interface OtGrantRow {
  id: string;
  employeeName: string;
  hours: number;
  reason: string | null;
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
    if (session?.user?.role !== "ADMIN" && session?.user?.role !== "OPERATOR") {
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
        employeeName: g.user.nickname || g.user.fullName || g.user.username,
        hours: g.hours,
        reason: g.reason,
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
