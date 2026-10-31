"use server";

import prisma from "@/lib/prisma";
import { auth } from "@/auth";
import { logError } from "@/lib/logger";
import { revalidatePath } from "next/cache";
import { canEditPlan } from "@/lib/steelAccess";
import { isSteelType, STEEL_TYPES } from "@/lib/steel";

type Fail = { success: false; error: string };

export interface LeftoverInput {
  steelType: string;
  sectionX: number;
  sectionY: number | null;
  thickness: number | null;
  length: number;
}

const MAX_MM = 100000;
const MAX_LEFTOVERS = 300;

function revalidate(planId?: string) {
  revalidatePath("/steel-cutting/offcuts");
  if (planId) revalidatePath(`/steel-cutting/${planId}`);
}

/** Takes offcuts for a plan (so it plans with them first) or gives them back. An offcut taken by another plan is left alone. */
export async function reserveOffcuts(planId: string, ids: string[], reserve: boolean): Promise<{ success: true } | Fail> {
  try {
    const check = await canEditPlan(planId);
    if (!("ok" in check)) return check;
    if (ids.length === 0 || ids.length > 500) return { success: true };
    if (reserve) {
      await prisma.steelOffcut.updateMany({ where: { id: { in: ids }, reservedPlanId: null }, data: { reservedPlanId: planId } });
    } else {
      await prisma.steelOffcut.updateMany({ where: { id: { in: ids }, reservedPlanId: planId }, data: { reservedPlanId: null } });
    }
    revalidate(planId);
    return { success: true };
  } catch (error) {
    logError("Error reserving offcuts:", error);
    return { success: false, error: "บันทึกไม่สำเร็จ" };
  }
}

/** The plan is done: the offcuts it used up leave the library and what is left of its bars goes in
 *  (what this plan stored before is replaced, so storing twice does not double the offcuts). */
export async function storeLeftovers(
  planId: string,
  data: { consumedIds: string[]; leftovers: LeftoverInput[] }
): Promise<{ success: true; stored: number } | Fail> {
  try {
    const check = await canEditPlan(planId);
    if (!("ok" in check)) return check;
    const plan = await prisma.steelPlan.findUnique({ where: { id: planId }, select: { name: true } });
    if (!plan) return { success: false, error: "ไม่พบแผนนี้" };
    if (data.leftovers.length > MAX_LEFTOVERS) return { success: false, error: `เก็บเศษได้ครั้งละไม่เกิน ${MAX_LEFTOVERS} ชิ้น` };
    const rows = [];
    for (const l of data.leftovers) {
      if (!isSteelType(l.steelType) || !(l.sectionX > 0 && l.sectionX <= MAX_MM) || !(l.length > 0 && l.length <= MAX_MM)) {
        return { success: false, error: "ข้อมูลเศษไม่ถูกต้อง" };
      }
      if (STEEL_TYPES[l.steelType].needsY && !(l.sectionY && l.sectionY > 0)) return { success: false, error: "ข้อมูลเศษไม่ถูกต้อง" };
      rows.push({
        steelType: l.steelType,
        sectionX: l.sectionX,
        sectionY: STEEL_TYPES[l.steelType].needsY ? l.sectionY : null,
        thickness: l.thickness && l.thickness > 0 ? l.thickness : null,
        length: Math.round(l.length * 10) / 10,
        sourcePlanId: planId,
        sourceName: plan.name.slice(0, 200),
      });
    }
    await prisma.$transaction([
      prisma.steelOffcut.deleteMany({ where: { id: { in: data.consumedIds.slice(0, 500) }, reservedPlanId: planId } }),
      prisma.steelOffcut.deleteMany({ where: { sourcePlanId: planId, reservedPlanId: null } }),
      prisma.steelOffcut.createMany({ data: rows }),
    ]);
    revalidate(planId);
    return { success: true, stored: rows.length };
  } catch (error) {
    logError("Error storing leftovers:", error);
    return { success: false, error: "เก็บเศษเข้าคลังไม่สำเร็จ" };
  }
}

/** All bars are cut: ticks the "ตัดเหล็ก" duties of the plan's project as done in the Gantt, so the next duty is the one that shows. */
export async function completeCuttingDuty(planId: string): Promise<{ success: true; count: number } | Fail> {
  try {
    const check = await canEditPlan(planId);
    if (!("ok" in check)) return check;
    const plan = await prisma.steelPlan.findUnique({ where: { id: planId }, select: { projectId: true } });
    if (!plan?.projectId) return { success: false, error: "แผนนี้ยังไม่ได้ผูกกับโปรเจกต์" };
    const done = await prisma.projectTask.updateMany({
      where: { projectId: plan.projectId, doneAt: null, duty: { contains: "ตัดเหล็ก" } },
      data: { doneAt: new Date() },
    });
    revalidatePath(`/projects/${plan.projectId}`);
    return { success: true, count: done.count };
  } catch (error) {
    logError("Error completing cutting duty:", error);
    return { success: false, error: "บันทึกไม่สำเร็จ" };
  }
}

/** Removes an offcut from the library (it was used outside the system, or scrapped). */
export async function deleteOffcut(id: string): Promise<{ success: true } | Fail> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };
    await prisma.steelOffcut.delete({ where: { id } });
    revalidate();
    return { success: true };
  } catch (error) {
    logError("Error deleting offcut:", error);
    return { success: false, error: "ลบไม่สำเร็จ" };
  }
}
