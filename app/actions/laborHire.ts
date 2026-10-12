"use server";

import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { auth } from "@/auth";
import { createActivityLog } from "./auth";
import { revalidatePath } from "next/cache";
import { canManageUsers } from "@/lib/roles";
import { validateLaborHireInput, type LaborHireInput } from "@/lib/laborHire";

// Costs are in here, so viewing is gated the same as editing: ADMIN/OPERATOR
// (the same audience as /users and /inventory) rather than every employee.
async function requireManager() {
  const session = await auth();
  if (!session?.user?.id || !canManageUsers(session.user.role)) return null;
  return session.user;
}

export interface LaborHireRow {
  id: string;
  dateKey: string;
  title: string;
  projectId: string | null;
  projectName: string | null;
  responsibleId: string;
  responsibleName: string;
  technicianCount: number;
  laborerCount: number;
  cost: number;
  note: string | null;
}

export interface LaborHireOptions {
  users: { id: string; name: string }[];
  projects: { id: string; name: string }[];
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ROWS = 300;

export async function getLaborHires({ from, to }: { from?: string; to?: string } = {}): Promise<
  { success: true; data: LaborHireRow[] } | { success: false; error: string }
> {
  try {
    if (!(await requireManager())) return { success: false, error: "Unauthorized" };

    // dateKey is a plain YYYY-MM-DD string, so lexicographic comparison is
    // the same as chronological comparison.
    const dateFilter: { gte?: string; lte?: string } = {};
    if (from && DATE_KEY.test(from)) dateFilter.gte = from;
    if (to && DATE_KEY.test(to)) dateFilter.lte = to;

    const rows = await prisma.outsideLaborHire.findMany({
      where: Object.keys(dateFilter).length ? { dateKey: dateFilter } : {},
      orderBy: [{ dateKey: "desc" }, { createdAt: "desc" }],
      take: MAX_ROWS,
      include: {
        responsible: { select: { username: true, fullName: true, nickname: true } },
        project: { select: { name: true } },
      },
    });

    return {
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        dateKey: r.dateKey,
        title: r.title,
        projectId: r.projectId,
        projectName: r.project?.name ?? null,
        responsibleId: r.responsibleId,
        responsibleName: r.responsible.nickname || r.responsible.fullName || r.responsible.username,
        technicianCount: r.technicianCount,
        laborerCount: r.laborerCount,
        cost: r.cost,
        note: r.note,
      })),
    };
  } catch (error) {
    logError("Error fetching labor hires:", error);
    return { success: false, error: "โหลดรายการจ้างไม่สำเร็จ" };
  }
}

export async function getLaborHireOptions(): Promise<
  { success: true; data: LaborHireOptions } | { success: false; error: string }
> {
  try {
    if (!(await requireManager())) return { success: false, error: "Unauthorized" };

    const [users, projects] = await Promise.all([
      prisma.user.findMany({
        where: { approved: true },
        orderBy: { username: "asc" },
        select: { id: true, username: true, fullName: true, nickname: true },
      }),
      prisma.project.findMany({ orderBy: { createdAt: "desc" }, take: 200, select: { id: true, name: true } }),
    ]);

    return {
      success: true,
      data: {
        users: users.map((u) => ({ id: u.id, name: u.nickname || u.fullName || u.username })),
        projects,
      },
    };
  } catch (error) {
    logError("Error fetching labor hire options:", error);
    return { success: false, error: "โหลดตัวเลือกไม่สำเร็จ" };
  }
}

/** Checks the referenced user/project actually exist — the form only offers
 *  real ones, but a direct call shouldn't be able to point at nothing. */
async function validateReferences(data: LaborHireInput): Promise<string | null> {
  const responsible = await prisma.user.findUnique({ where: { id: data.responsibleId }, select: { id: true } });
  if (!responsible) return "ไม่พบผู้รับผิดชอบคนนี้";
  if (data.projectId) {
    const project = await prisma.project.findUnique({ where: { id: data.projectId }, select: { id: true } });
    if (!project) return "ไม่พบโปรเจกต์นี้";
  }
  return null;
}

function toRecord(data: LaborHireInput) {
  return {
    dateKey: data.dateKey,
    title: data.title.trim(),
    projectId: data.projectId || null,
    responsibleId: data.responsibleId,
    technicianCount: data.technicianCount,
    laborerCount: data.laborerCount,
    cost: data.cost,
    note: data.note?.trim() || null,
  };
}

function describe(data: LaborHireInput) {
  return `${data.dateKey} "${data.title.trim()}" ช่าง ${data.technicianCount} / คนงาน ${data.laborerCount} คน ค่าจ้าง ${data.cost} บาท`;
}

export async function createLaborHire(data: LaborHireInput) {
  try {
    const user = await requireManager();
    if (!user) return { success: false, error: "Unauthorized" };

    const invalid = validateLaborHireInput(data) ?? (await validateReferences(data));
    if (invalid) return { success: false, error: invalid };

    await prisma.outsideLaborHire.create({ data: { ...toRecord(data), createdById: user.id! } });
    await createActivityLog("ADD_LABOR_HIRE", `Added outside labor hire: ${describe(data)}`);

    revalidatePath("/labor-hire");
    return { success: true };
  } catch (error) {
    logError("Error creating labor hire:", error);
    return { success: false, error: "บันทึกไม่สำเร็จ" };
  }
}

export async function updateLaborHire(id: string, data: LaborHireInput) {
  try {
    if (!(await requireManager())) return { success: false, error: "Unauthorized" };

    const existing = await prisma.outsideLaborHire.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return { success: false, error: "ไม่พบรายการนี้" };

    const invalid = validateLaborHireInput(data) ?? (await validateReferences(data));
    if (invalid) return { success: false, error: invalid };

    await prisma.outsideLaborHire.update({ where: { id }, data: toRecord(data) });
    await createActivityLog("EDIT_LABOR_HIRE", `Edited outside labor hire: ${describe(data)}`);

    revalidatePath("/labor-hire");
    return { success: true };
  } catch (error) {
    logError("Error updating labor hire:", error);
    return { success: false, error: "บันทึกไม่สำเร็จ" };
  }
}

export async function deleteLaborHire(id: string) {
  try {
    if (!(await requireManager())) return { success: false, error: "Unauthorized" };

    const existing = await prisma.outsideLaborHire.findUnique({ where: { id } });
    if (!existing) return { success: false, error: "ไม่พบรายการนี้" };

    await prisma.outsideLaborHire.delete({ where: { id } });
    await createActivityLog(
      "DELETE_LABOR_HIRE",
      `Deleted outside labor hire: ${existing.dateKey} "${existing.title}" (${existing.cost} บาท)`
    );

    revalidatePath("/labor-hire");
    return { success: true };
  } catch (error) {
    logError("Error deleting labor hire:", error);
    return { success: false, error: "ลบไม่สำเร็จ" };
  }
}
