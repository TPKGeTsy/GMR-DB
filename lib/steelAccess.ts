import prisma from "@/lib/prisma";
import { auth } from "@/auth";

/** The creator, an admin, or a member of the plan's project can change a plan. */
export async function canEditPlan(planId: string): Promise<{ ok: true; userId: string } | { success: false; error: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { success: false, error: "Unauthorized" };
  const plan = await prisma.steelPlan.findUnique({
    where: { id: planId },
    select: { createdById: true, project: { select: { createdById: true, members: { select: { userId: true } } } } },
  });
  if (!plan) return { success: false, error: "ไม่พบแผนนี้" };
  const isOwner = plan.createdById === userId;
  const isAdmin = session.user.role === "ADMIN";
  const inProject =
    !!plan.project && (plan.project.createdById === userId || plan.project.members.some((m) => m.userId === userId));
  if (!isOwner && !isAdmin && !inProject) return { success: false, error: "ไม่มีสิทธิ์แก้ไขแผนนี้" };
  return { ok: true, userId };
}
