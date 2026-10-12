"use server";

import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { auth } from "@/auth";
import { createActivityLog } from "./auth";
import { revalidatePath } from "next/cache";
import { canManageUsers } from "@/lib/roles";
import {
  validateLaborHireInput,
  resolveLaborHire,
  buildVendorDirectory,
  rankVendors,
  normalizeName,
  HIRE_TYPES,
  RATE_MODES,
  CONTRACT_TYPES,
  WORKER_ROLES,
  type HireType,
  type RateMode,
  type ContractType,
  type WorkerRole,
  type LaborHireInput,
  type DirectoryHire,
  type VendorEntry,
} from "@/lib/laborHire";

// Costs and agreed wages are in here, so viewing is gated the same as
// editing: ADMIN/OPERATOR (the same audience as /users and /inventory)
// rather than every employee.
async function requireManager() {
  const session = await auth();
  if (!session?.user?.id || !canManageUsers(session.user.role)) return null;
  return session.user;
}

export interface LaborHireWorkerRow {
  name: string;
  role: WorkerRole;
  dailyRate: number | null;
  note: string | null;
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
  hireType: HireType;
  vendorName: string | null;
  vendorPhone: string | null;
  trade: string | null;
  location: string | null;
  reference: string | null;
  contractType: ContractType;
  days: number;
  rateMode: RateMode;
  technicianRate: number | null;
  laborerRate: number | null;
  paidAmount: number;
  paidDateKey: string | null;
  workers: LaborHireWorkerRow[];
}

export interface LaborHireOptions {
  users: { id: string; name: string }[];
  projects: { id: string; name: string }[];
}

/** A directory entry without its (potentially long) job list — what the
 *  name-search dropdown needs. */
export type VendorSuggestion = Omit<VendorEntry, "jobs">;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ROWS = 300;
const HISTORY_MAX_HIRES = 2000;

// Stored as plain strings; fall back rather than trust a value that somehow
// isn't one of the known options.
const pick = <T extends string>(options: readonly T[], value: string, fallback: T): T =>
  (options as readonly string[]).includes(value) ? (value as T) : fallback;

const hireInclude = {
  responsible: { select: { username: true, fullName: true, nickname: true } },
  project: { select: { name: true } },
  workers: { orderBy: { sortOrder: "asc" as const } },
} as const;

type HireWithRelations = NonNullable<Awaited<ReturnType<typeof findOneWithRelations>>>;
const findOneWithRelations = (id: string) => prisma.outsideLaborHire.findUnique({ where: { id }, include: hireInclude });

function toWorkerRows(workers: HireWithRelations["workers"]): LaborHireWorkerRow[] {
  return workers.map((w) => ({
    name: w.name,
    role: pick(WORKER_ROLES, w.role, "LABORER"),
    dailyRate: w.dailyRate,
    note: w.note,
  }));
}

function toRow(r: HireWithRelations): LaborHireRow {
  return {
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
    hireType: pick(HIRE_TYPES, r.hireType, "COMPANY"),
    vendorName: r.vendorName,
    vendorPhone: r.vendorPhone,
    trade: r.trade,
    location: r.location,
    reference: r.reference,
    contractType: pick(CONTRACT_TYPES, r.contractType, "FIXED_TERM"),
    days: r.days,
    rateMode: pick(RATE_MODES, r.rateMode, "LUMP_SUM"),
    technicianRate: r.technicianRate,
    laborerRate: r.laborerRate,
    paidAmount: r.paidAmount,
    paidDateKey: r.paidDateKey,
    workers: toWorkerRows(r.workers),
  };
}

function toDirectoryHire(r: HireWithRelations): DirectoryHire {
  const row = toRow(r);
  return {
    id: row.id,
    dateKey: row.dateKey,
    title: row.title,
    projectId: row.projectId,
    projectName: row.projectName,
    responsibleName: row.responsibleName,
    vendorName: row.vendorName,
    vendorPhone: row.vendorPhone,
    hireType: row.hireType,
    contractType: row.contractType,
    days: row.days,
    technicianCount: row.technicianCount,
    laborerCount: row.laborerCount,
    rateMode: row.rateMode,
    technicianRate: row.technicianRate,
    laborerRate: row.laborerRate,
    cost: row.cost,
    paidAmount: row.paidAmount,
    trade: row.trade,
    location: row.location,
    note: row.note,
    workers: row.workers,
  };
}

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
      include: hireInclude,
    });

    return { success: true, data: rows.map(toRow) };
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

/** Name search for "have we hired this company/person before?". Matches
 *  every typed word anywhere in a contractor's name or a listed worker's
 *  name (case-insensitive LIKE %word%) against the existing log, so there's
 *  no separate list to keep in sync. An empty query returns the most
 *  recently hired. */
export async function suggestLaborVendors(
  query: string
): Promise<{ success: true; data: VendorSuggestion[] } | { success: false; error: string }> {
  try {
    if (!(await requireManager())) return { success: false, error: "Unauthorized" };

    const tokens = normalizeName(query ?? "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 4)
      .map((t) => t.slice(0, 50));

    const where = tokens.length
      ? {
          AND: tokens.map((t) => ({
            OR: [
              { vendorName: { contains: t, mode: "insensitive" as const } },
              // nameKey is already normalized (lowercased), and so is the token.
              { workers: { some: { nameKey: { contains: t } } } },
            ],
          })),
        }
      : { OR: [{ vendorName: { not: null } }, { workers: { some: {} } }] };

    const rows = await prisma.outsideLaborHire.findMany({
      where,
      orderBy: { dateKey: "desc" },
      take: 300,
      include: hireInclude,
    });

    const entries = rankVendors(buildVendorDirectory(rows.map(toDirectoryHire)), query ?? "").slice(0, tokens.length ? 8 : 6);
    return {
      success: true,
      data: entries.map((entry) => {
        const { jobs, ...rest } = entry;
        void jobs;
        return rest;
      }),
    };
  } catch (error) {
    logError("Error suggesting labor vendors:", error);
    return { success: false, error: "ค้นหาไม่สำเร็จ" };
  }
}

export interface LaborHistory {
  asOf: string;
  entries: VendorEntry[];
  hires: Record<string, DirectoryHire>;
  totals: { budget: number; paid: number; jobs: number; entries: number };
  truncated: boolean;
}

/** Everything hired up to and including `asOf`, grouped by company/person,
 *  for the consult history page. `q` narrows the list with the same word
 *  matching the suggestions use. */
export async function getLaborHistory({ asOf, q }: { asOf: string; q?: string }): Promise<
  { success: true; data: LaborHistory } | { success: false; error: string }
> {
  try {
    if (!(await requireManager())) return { success: false, error: "Unauthorized" };
    if (!DATE_KEY.test(asOf)) return { success: false, error: "วันที่ไม่ถูกต้อง" };

    const rows = await prisma.outsideLaborHire.findMany({
      where: { dateKey: { lte: asOf } },
      orderBy: [{ dateKey: "desc" }, { createdAt: "desc" }],
      take: HISTORY_MAX_HIRES,
      include: hireInclude,
    });

    const hires = rows.map(toDirectoryHire);
    const entries = rankVendors(buildVendorDirectory(hires), q ?? "");

    return {
      success: true,
      data: {
        asOf,
        entries,
        hires: Object.fromEntries(hires.map((h) => [h.id, h])),
        totals: {
          budget: hires.reduce((sum, h) => sum + h.cost, 0),
          paid: hires.reduce((sum, h) => sum + h.paidAmount, 0),
          jobs: hires.length,
          entries: entries.length,
        },
        truncated: rows.length >= HISTORY_MAX_HIRES,
      },
    };
  } catch (error) {
    logError("Error building labor history:", error);
    return { success: false, error: "โหลดประวัติไม่สำเร็จ" };
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

function describe(data: LaborHireInput) {
  const r = resolveLaborHire(data);
  return `${r.dateKey} "${r.title}" ช่าง ${r.technicianCount} / คนงาน ${r.laborerCount} คน ${r.days} วัน ค่าจ้าง ${r.cost} บาท (จ่ายแล้ว ${r.paidAmount})`;
}

/** Splits the resolved record into the hire's own columns and the nested
 *  worker rows Prisma wants. */
function toWrite(data: LaborHireInput) {
  const { workers, ...hire } = resolveLaborHire(data);
  return {
    hire,
    workers: workers.map((w, i) => ({
      name: w.name,
      nameKey: normalizeName(w.name),
      role: w.role,
      dailyRate: w.dailyRate,
      note: w.note,
      sortOrder: i,
    })),
  };
}

export async function createLaborHire(data: LaborHireInput) {
  try {
    const user = await requireManager();
    if (!user) return { success: false, error: "Unauthorized" };

    const invalid = validateLaborHireInput(data) ?? (await validateReferences(data));
    if (invalid) return { success: false, error: invalid };

    const { hire, workers } = toWrite(data);
    await prisma.outsideLaborHire.create({
      data: { ...hire, createdById: user.id!, workers: { create: workers } },
    });
    await createActivityLog("ADD_LABOR_HIRE", `Added outside labor hire: ${describe(data)}`);

    revalidatePath("/labor-hire");
    revalidatePath("/labor-hire/history");
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

    const { hire, workers } = toWrite(data);
    // The worker list is replaced as a whole inside one transaction, so a
    // failed save can't leave a hire with half its old and half its new names.
    await prisma.$transaction([
      prisma.outsideLaborWorker.deleteMany({ where: { hireId: id } }),
      prisma.outsideLaborHire.update({ where: { id }, data: { ...hire, workers: { create: workers } } }),
    ]);
    await createActivityLog("EDIT_LABOR_HIRE", `Edited outside labor hire: ${describe(data)}`);

    revalidatePath("/labor-hire");
    revalidatePath("/labor-hire/history");
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
    revalidatePath("/labor-hire/history");
    return { success: true };
  } catch (error) {
    logError("Error deleting labor hire:", error);
    return { success: false, error: "ลบไม่สำเร็จ" };
  }
}
