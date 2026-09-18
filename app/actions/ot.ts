"use server";

import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { auth } from "@/auth";

export interface OtGrantRow {
  id: string;
  employeeName: string;
  hours: number;
  reason: string | null;
  grantedByName: string;
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
        createdAt: g.createdAt.toISOString(),
      })),
    };
  } catch (error) {
    logError("Error fetching OT grants:", error);
    return { success: false, error: "Failed to load OT grants" };
  }
}
