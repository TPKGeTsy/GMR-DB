"use server";

import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canEditPlan } from "@/lib/steelAccess";
import { getDocumentProxy } from "unpdf";
import {
  DEFAULT_KERF_MM,
  DEFAULT_NEW_BAR_LENGTH_MM,
  STEEL_TYPES,
  isSteelType,
  parseBomLines,
  type SkippedRow,
  type SteelPartInput,
} from "@/lib/steel";

const MAX_MM = 100000;
const MAX_QTY = 10000;

const profileShape = {
  steelType: z.string().refine(isSteelType, "ประเภทเหล็กไม่ถูกต้อง"),
  sectionX: z.number().positive("x ต้องมากกว่า 0").max(MAX_MM),
  sectionY: z.number().positive("y ต้องมากกว่า 0").max(MAX_MM).nullable(),
  thickness: z.number().positive("ความหนาต้องมากกว่า 0").max(MAX_MM).nullable().optional(),
};

const partSchema = z.object({
  ...profileShape,
  cutLength: z.number().positive("ความยาวตัดต้องมากกว่า 0").max(MAX_MM),
  quantity: z.number().int("จำนวนต้องเป็นจำนวนเต็ม").min(1).max(MAX_QTY),
  note: z.string().trim().max(200).optional(),
  sourceFile: z.string().trim().max(200).nullable().optional(),
  baseQuantity: z.number().int().min(0).max(MAX_QTY).nullable().optional(),
  rounds: z.number().int().min(0).max(1000).optional(),
});

const stockSchema = z.object({
  ...profileShape,
  length: z.number().positive("ความยาวเหล็กต้องมากกว่า 0").max(MAX_MM),
  quantity: z.number().int("จำนวนต้องเป็นจำนวนเต็ม").min(1).max(MAX_QTY),
});

type Fail = { success: false; error: string };

/** Round bars and pipes have one size (diameter); the others need x and y. */
function checkSection(steelType: string, sectionY: number | null): string | null {
  if (!isSteelType(steelType)) return "ประเภทเหล็กไม่ถูกต้อง";
  if (STEEL_TYPES[steelType].needsY && sectionY === null) return "เหล็กประเภทนี้ต้องใส่ค่า y";
  return null;
}

function revalidatePlan(planId: string) {
  revalidatePath("/steel-cutting");
  revalidatePath(`/steel-cutting/${planId}`);
}

/** Saw kerf and bar length for a new plan: what the user chose (if sane) or the defaults. */
function cutDefaults(options?: { kerf: number; newBarLength: number }) {
  const kerf = options && options.kerf >= 0 && options.kerf <= 100 ? options.kerf : DEFAULT_KERF_MM;
  const newBarLength =
    options && options.newBarLength > 0 && options.newBarLength <= MAX_MM ? options.newBarLength : DEFAULT_NEW_BAR_LENGTH_MM;
  return { kerf, newBarLength };
}

/** The files a row came from, kept as its note (e.g. "Door, RB1"). */
function noteFor(raw: SteelPartInput, typed?: string | null): string | null {
  if (typed) return typed;
  return raw.sources && raw.sources.length > 0 ? raw.sources.join(", ").slice(0, 200) : null;
}

/** "Untitled (1)", "Untitled (2)", ... - the next free number. */
async function nextUntitledName(): Promise<string> {
  const rows = await prisma.steelPlan.findMany({ where: { name: { startsWith: "Untitled (" } }, select: { name: true } });
  let max = 0;
  for (const { name } of rows) {
    const m = /^Untitled \((\d+)\)$/.exec(name);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `Untitled (${max + 1})`;
}

/** The name is optional; without one the plan is called "Untitled (n)". */
export async function createSteelPlan(
  name: string,
  projectId: string | null,
  options?: { kerf: number; newBarLength: number }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false as const, error: "Unauthorized" };
    const trimmed = name.trim();
    const plan = await prisma.steelPlan.create({
      data: {
        name: trimmed ? trimmed.slice(0, 120) : await nextUntitledName(),
        projectId: projectId || null,
        createdById: session.user.id,
        ...cutDefaults(options),
      },
    });
    revalidatePath("/steel-cutting");
    if (projectId) revalidatePath(`/projects/${projectId}`);
    return { success: true as const, id: plan.id };
  } catch (error) {
    logError("Error creating steel plan:", error);
    return { success: false as const, error: "สร้างแผนไม่สำเร็จ" };
  }
}

/** A plan made straight from a dropped file: the pieces are saved with it. */
export async function createSteelPlanWithParts(
  name: string,
  projectId: string | null,
  parts: SteelPartInput[],
  options?: { kerf: number; newBarLength: number }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false as const, error: "Unauthorized" };
    if (parts.length === 0) return { success: false as const, error: "ไม่มีรายการที่ใช้ได้ในไฟล์" };
    if (parts.length > 500) return { success: false as const, error: "ไฟล์มีรายการมากเกิน 500 รายการ" };
    const rows = [];
    for (const raw of parts) {
      const parsed = partSchema.safeParse(raw);
      if (!parsed.success) return { success: false as const, error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
      const bad = checkSection(parsed.data.steelType, parsed.data.sectionY);
      if (bad) return { success: false as const, error: bad };
      const needsY = STEEL_TYPES[parsed.data.steelType as keyof typeof STEEL_TYPES].needsY;
      rows.push({
        ...parsed.data,
        sectionY: needsY ? parsed.data.sectionY : null,
        thickness: parsed.data.thickness ?? null,
        note: noteFor(raw, parsed.data.note),
        sourceFile: parsed.data.sourceFile || null,
        baseQuantity: parsed.data.baseQuantity ?? null,
        rounds: parsed.data.rounds ?? 1,
      });
    }
    const trimmed = name.trim();
    const plan = await prisma.steelPlan.create({
      data: {
        name: trimmed ? trimmed.slice(0, 120) : await nextUntitledName(),
        projectId: projectId || null,
        createdById: session.user.id,
        ...cutDefaults(options),
        parts: { create: rows },
      },
    });
    revalidatePath("/steel-cutting");
    if (projectId) revalidatePath(`/projects/${projectId}`);
    return { success: true as const, id: plan.id };
  } catch (error) {
    logError("Error creating steel plan from file:", error);
    return { success: false as const, error: "สร้างแผนไม่สำเร็จ" };
  }
}

/** Plan name (blank keeps the current one) and project. */
export async function updateSteelPlanSettings(planId: string, data: { name: string; projectId: string | null }) {
  try {
    const check = await canEditPlan(planId);
    if (!("ok" in check)) return check;
    const before = await prisma.steelPlan.findUnique({ where: { id: planId }, select: { projectId: true } });
    const name = data.name.trim();
    await prisma.steelPlan.update({
      where: { id: planId },
      data: { ...(name ? { name: name.slice(0, 120) } : {}), projectId: data.projectId || null },
    });
    revalidatePlan(planId);
    for (const id of [before?.projectId, data.projectId]) if (id) revalidatePath(`/projects/${id}`);
    return { success: true };
  } catch (error) {
    logError("Error updating steel plan:", error);
    return { success: false, error: "บันทึกไม่สำเร็จ" };
  }
}

/** Saw-blade kerf and the plan's standard bar length. */
export async function updateSteelPlanCutSettings(planId: string, data: { kerf: number; newBarLength: number }) {
  try {
    const check = await canEditPlan(planId);
    if (!("ok" in check)) return check;
    if (!(data.kerf >= 0 && data.kerf <= 100)) return { success: false, error: "ระยะตัดไม่ถูกต้อง" };
    if (!(data.newBarLength > 0 && data.newBarLength <= MAX_MM)) return { success: false, error: "ความยาวเหล็กไม่ถูกต้อง" };
    await prisma.steelPlan.update({ where: { id: planId }, data: { kerf: data.kerf, newBarLength: data.newBarLength } });
    revalidatePlan(planId);
    return { success: true };
  } catch (error) {
    logError("Error updating steel cut settings:", error);
    return { success: false, error: "บันทึกไม่สำเร็จ" };
  }
}

export async function deleteSteelPlan(planId: string) {
  try {
    const check = await canEditPlan(planId);
    if (!("ok" in check)) return check;
    const plan = await prisma.steelPlan.delete({ where: { id: planId } });
    revalidatePath("/steel-cutting");
    if (plan.projectId) revalidatePath(`/projects/${plan.projectId}`);
    return { success: true };
  } catch (error) {
    logError("Error deleting steel plan:", error);
    return { success: false, error: "ลบแผนไม่สำเร็จ" };
  }
}

/** Adds one or many pieces to cut (the many form is used by CSV import). */
export async function addSteelParts(planId: string, parts: SteelPartInput[]) {
  try {
    const check = await canEditPlan(planId);
    if (!("ok" in check)) return check;
    if (parts.length === 0) return { success: false, error: "ไม่มีรายการ" };
    if (parts.length > 500) return { success: false, error: "เพิ่มได้ครั้งละไม่เกิน 500 รายการ" };
    const rows = [];
    for (const raw of parts) {
      const parsed = partSchema.safeParse(raw);
      if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
      const bad = checkSection(parsed.data.steelType, parsed.data.sectionY);
      if (bad) return { success: false, error: bad };
      const needsY = STEEL_TYPES[parsed.data.steelType as keyof typeof STEEL_TYPES].needsY;
      rows.push({
        planId,
        ...parsed.data,
        sectionY: needsY ? parsed.data.sectionY : null,
        thickness: parsed.data.thickness ?? null,
        note: noteFor(raw, parsed.data.note),
        sourceFile: parsed.data.sourceFile || null,
        baseQuantity: parsed.data.baseQuantity ?? null,
        rounds: parsed.data.rounds ?? 1,
      });
    }
    await prisma.steelPlanPart.createMany({ data: rows });
    revalidatePlan(planId);
    return { success: true };
  } catch (error) {
    logError("Error adding steel parts:", error);
    return { success: false, error: "เพิ่มรายการไม่สำเร็จ" };
  }
}

/** The pieces of a row: its QTY x rounds (a row typed by hand has no file QTY, so its own count is the base). */
function pieces(base: number, rounds: number) {
  return Math.max(0, Math.min(MAX_QTY, base * rounds));
}

/** Edits a row after it was added: length, QTY and rounds (0 rounds = leave the row out). */
export async function updateSteelPart(partId: string, patch: { cutLength?: number; baseQuantity?: number; rounds?: number }) {
  try {
    const part = await prisma.steelPlanPart.findUnique({ where: { id: partId } });
    if (!part) return { success: false, error: "ไม่พบรายการ" };
    const check = await canEditPlan(part.planId);
    if (!("ok" in check)) return check;

    const cutLength = patch.cutLength ?? part.cutLength;
    const base = patch.baseQuantity ?? part.baseQuantity ?? part.quantity;
    const rounds = patch.rounds ?? part.rounds;
    if (!(cutLength > 0 && cutLength <= MAX_MM)) return { success: false, error: "ความยาวต้องมากกว่า 0" };
    if (!Number.isInteger(base) || base < 0 || base > MAX_QTY) return { success: false, error: "QTY ไม่ถูกต้อง" };
    if (!Number.isInteger(rounds) || rounds < 0 || rounds > 1000) return { success: false, error: "จำนวนรอบไม่ถูกต้อง" };

    await prisma.steelPlanPart.update({
      where: { id: partId },
      data: { cutLength, baseQuantity: base, rounds, quantity: pieces(base, rounds) },
    });
    revalidatePlan(part.planId);
    return { success: true };
  } catch (error) {
    logError("Error updating steel part:", error);
    return { success: false, error: "บันทึกไม่สำเร็จ" };
  }
}

/** Sets the rounds of every row that came from one file. */
export async function setFileRounds(planId: string, sourceFile: string, rounds: number) {
  try {
    const check = await canEditPlan(planId);
    if (!("ok" in check)) return check;
    if (!Number.isInteger(rounds) || rounds < 0 || rounds > 1000) return { success: false, error: "จำนวนรอบไม่ถูกต้อง" };
    const rows = await prisma.steelPlanPart.findMany({ where: { planId, sourceFile } });
    await prisma.$transaction(
      rows.map((r) =>
        prisma.steelPlanPart.update({
          where: { id: r.id },
          data: { rounds, quantity: pieces(r.baseQuantity ?? r.quantity, rounds), baseQuantity: r.baseQuantity ?? r.quantity },
        })
      )
    );
    revalidatePlan(planId);
    return { success: true };
  } catch (error) {
    logError("Error setting file rounds:", error);
    return { success: false, error: "บันทึกไม่สำเร็จ" };
  }
}

/** Removes every row that came from one file. */
export async function deleteFileParts(planId: string, sourceFile: string) {
  try {
    const check = await canEditPlan(planId);
    if (!("ok" in check)) return check;
    await prisma.steelPlanPart.deleteMany({ where: { planId, sourceFile } });
    revalidatePlan(planId);
    return { success: true };
  } catch (error) {
    logError("Error deleting file rows:", error);
    return { success: false, error: "ลบรายการไม่สำเร็จ" };
  }
}

export async function deleteSteelPart(partId: string) {
  try {
    const part = await prisma.steelPlanPart.findUnique({ where: { id: partId }, select: { planId: true } });
    if (!part) return { success: false, error: "ไม่พบรายการ" };
    const check = await canEditPlan(part.planId);
    if (!("ok" in check)) return check;
    await prisma.steelPlanPart.delete({ where: { id: partId } });
    revalidatePlan(part.planId);
    return { success: true };
  } catch (error) {
    logError("Error deleting steel part:", error);
    return { success: false, error: "ลบรายการไม่สำเร็จ" };
  }
}

export async function addSteelStock(
  planId: string,
  stock: { steelType: string; sectionX: number; sectionY: number | null; thickness?: number | null; length: number; quantity: number }
) {
  try {
    const check = await canEditPlan(planId);
    if (!("ok" in check)) return check;
    const parsed = stockSchema.safeParse(stock);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
    const bad = checkSection(parsed.data.steelType, parsed.data.sectionY);
    if (bad) return { success: false, error: bad };
    const needsY = STEEL_TYPES[parsed.data.steelType as keyof typeof STEEL_TYPES].needsY;
    await prisma.steelPlanStock.create({
      data: { planId, ...parsed.data, sectionY: needsY ? parsed.data.sectionY : null, thickness: parsed.data.thickness ?? null },
    });
    revalidatePlan(planId);
    return { success: true };
  } catch (error) {
    logError("Error adding steel stock:", error);
    return { success: false, error: "เพิ่มเหล็กที่มีไม่สำเร็จ" };
  }
}

/** Sets the bar length used for one kind of steel, or (length null) goes back
 *  to the plan's standard length. */
export async function setSteelBarLength(
  planId: string,
  profile: { steelType: string; sectionX: number; sectionY: number | null; thickness: number | null },
  length: number | null
) {
  try {
    const check = await canEditPlan(planId);
    if (!("ok" in check)) return check;
    if (!isSteelType(profile.steelType)) return { success: false, error: "ประเภทเหล็กไม่ถูกต้อง" };
    if (length !== null && !(length > 0 && length <= MAX_MM)) return { success: false, error: "ความยาวเหล็กไม่ถูกต้อง" };
    const where = {
      planId,
      steelType: profile.steelType,
      sectionX: profile.sectionX,
      sectionY: profile.sectionY,
      thickness: profile.thickness,
    };
    await prisma.$transaction([
      prisma.steelPlanBar.deleteMany({ where }),
      ...(length === null ? [] : [prisma.steelPlanBar.create({ data: { ...where, length } })]),
    ]);
    revalidatePlan(planId);
    return { success: true };
  } catch (error) {
    logError("Error setting steel bar length:", error);
    return { success: false, error: "บันทึกความยาวเหล็กไม่สำเร็จ" };
  }
}

export async function deleteSteelStock(stockId: string) {
  try {
    const row = await prisma.steelPlanStock.findUnique({ where: { id: stockId }, select: { planId: true } });
    if (!row) return { success: false, error: "ไม่พบรายการ" };
    const check = await canEditPlan(row.planId);
    if (!("ok" in check)) return check;
    await prisma.steelPlanStock.delete({ where: { id: stockId } });
    revalidatePlan(row.planId);
    return { success: true };
  } catch (error) {
    logError("Error deleting steel stock:", error);
    return { success: false, error: "ลบรายการไม่สำเร็จ" };
  }
}

const MAX_PDF_BYTES = 5 * 1024 * 1024;

/** Reads the bill-of-materials table of a drawing PDF (text PDFs only - a
 *  scanned image has no text to read). Nothing is saved: the caller shows the
 *  result for checking and then calls addSteelParts. */
export async function parseSteelPdf(
  formData: FormData
): Promise<{ success: true; parts: SteelPartInput[]; skipped: SkippedRow[] } | Fail> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };
    const file = formData.get("file");
    if (!(file instanceof File)) return { success: false, error: "ไม่พบไฟล์" };
    if (file.size > MAX_PDF_BYTES) return { success: false, error: "ไฟล์ใหญ่เกิน 5 MB" };
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") return { success: false, error: "ไม่ใช่ไฟล์ PDF" };

    const pdf = await getDocumentProxy(bytes);
    const lines: string[] = [];
    for (let pageNo = 1; pageNo <= Math.min(pdf.numPages, 20); pageNo++) {
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      // Group the text pieces into table lines by height, then left to right.
      const rows = new Map<number, { x: number; text: string }[]>();
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const y = Math.round(item.transform[5] / 3);
        const row = rows.get(y) ?? [];
        row.push({ x: item.transform[4], text: item.str });
        rows.set(y, row);
      }
      for (const y of [...rows.keys()].sort((a, b) => b - a)) {
        lines.push(
          rows
            .get(y)!
            .sort((a, b) => a.x - b.x)
            .map((i) => i.text)
            .join(" ")
        );
      }
    }
    if (lines.length === 0) return { success: false, error: "อ่านข้อความจาก PDF ไม่ได้ (อาจเป็นไฟล์ภาพสแกน)" };

    const { parts, skipped } = parseBomLines(lines);
    if (parts.length === 0 && skipped.length === 0) {
      return { success: false, error: "ไม่พบตารางรายการวัสดุ (ITEM / QTY / DESCRIPTION / LENGTH) ใน PDF" };
    }
    return { success: true, parts, skipped };
  } catch (error) {
    logError("Error reading steel PDF:", error);
    return { success: false, error: "อ่านไฟล์ PDF ไม่สำเร็จ" };
  }
}
