"use server";

import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { revalidatePath } from "next/cache";
import { canEditPlan } from "@/lib/steelAccess";
import { hasCutListHeader, mergeParts, parseBomLines, parsePartsCsv, type SkippedRow, type SteelPartInput } from "@/lib/steel";
import { addPartsListImage, addDxfPart, importHardwarePdf, setHardwareFileRounds } from "@/app/actions/steelSources";
import { addSteelParts } from "@/app/actions/steel";

const MAX_PDF_BYTES = 5 * 1024 * 1024;
const MAX_ROUNDS = 1000;

export interface SmartImportResult {
  name: string;
  ok: boolean;
  /** What was done with the file, one line each ("ใบตัดเหล็ก 12 รายการ"). */
  notes: string[];
  /** Rows the reader could not use, with the reason. */
  skipped: SkippedRow[];
  error?: string;
}

/** Text lines of a PDF, grouped by height then left to right. */
async function pdfLines(bytes: Uint8Array): Promise<string[]> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const lines: string[] = [];
  for (let pageNo = 1; pageNo <= Math.min(pdf.numPages, 20); pageNo++) {
    const content = await (await pdf.getPage(pageNo)).getTextContent();
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
  return lines;
}

/** One dropped file, whatever it is: a cut list PDF (steel rows), a parts list PDF (screws, nuts, washers),
 *  a DXF flat pattern or a picture of a parts list. `rounds` is the number of sets (every QTY counts that many times). */
export async function smartImportFile(planId: string, formData: FormData): Promise<SmartImportResult> {
  const file = formData.get("file");
  const name = file instanceof File ? file.name : "?";
  const fail = (error: string): SmartImportResult => ({ name, ok: false, notes: [], skipped: [], error });
  try {
    const check = await canEditPlan(planId);
    if (!("ok" in check)) return fail(check.error);
    if (!(file instanceof File)) return fail("ไม่พบไฟล์");
    const aliases = await prisma.steelTypeAlias.findMany({ select: { keyword: true, steelType: true } });
    const rounds = Math.min(MAX_ROUNDS, Math.max(1, Math.floor(Number(formData.get("rounds")) || 1)));
    const lower = file.name.toLowerCase();

    if (lower.endsWith(".dxf")) {
      const sourceFile = file.name.slice(0, 200);
      const before = await prisma.steelPlanSheetPart.findFirst({ where: { planId, sourceFile }, select: { id: true } });
      const done = await addDxfPart(planId, formData);
      if (!done.success) return fail(done.error);
      // A new part gets the sets typed here; a part dropped again keeps the count it already has.
      let times = 1;
      if (!before && rounds > 1) {
        const part = await prisma.steelPlanSheetPart.findFirst({ where: { planId, sourceFile }, select: { id: true, quantity: true } });
        if (part) {
          times = rounds;
          await prisma.steelPlanSheetPart.update({ where: { id: part.id }, data: { quantity: Math.min(10000, part.quantity * rounds) } });
        }
      }
      return { name, ok: true, notes: [`แผ่นตัด (DXF): ${done.name}${times > 1 ? ` ×${times}` : ""}`], skipped: [] };
    }

    if (/\.(png|jpe?g|webp)$/i.test(lower)) {
      const done = await addPartsListImage(planId, formData);
      return done.success ? { name, ok: true, notes: ["เก็บรูป parts list ไว้กับแผน"], skipped: [] } : fail(done.error);
    }

    if (lower.endsWith(".csv") || lower.endsWith(".txt") || lower.endsWith(".tsv")) {
      const text = await file.text();
      const bom = parseBomLines(text.split(/\r?\n/), aliases);
      const csv = bom.parts.length > 0 ? null : parsePartsCsv(text);
      const read = csv ? { parts: csv.parts, skipped: csv.errors.map((e) => ({ line: e, reason: "" })) } : bom;
      if (read.parts.length === 0) return fail("ไม่พบรายการที่ใช้ได้ในไฟล์");
      return await saveSteelRows(planId, file.name, read.parts, read.skipped, rounds);
    }

    if (!lower.endsWith(".pdf")) return fail("ไม่รู้จักชนิดไฟล์นี้ (รองรับ PDF, DXF, CSV, รูป PNG/JPG/WEBP)");
    if (file.size > MAX_PDF_BYTES) return fail("ไฟล์ใหญ่เกิน 5 MB");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") return fail("ไม่ใช่ไฟล์ PDF");

    const lines = await pdfLines(bytes);
    if (lines.length === 0) return fail("อ่านข้อความจาก PDF ไม่ได้ (อาจเป็นไฟล์ภาพสแกน)");

    const notes: string[] = [];
    let skipped: SkippedRow[] = [];

    // Steel rows: only from a cut list (ITEM / QTY / DESCRIPTION / LENGTH).
    if (hasCutListHeader(lines)) {
      const { parts, skipped: skippedRows } = parseBomLines(lines, aliases);
      skipped = skippedRows;
      if (parts.length > 0) {
        const saved = await saveSteelRows(planId, file.name, parts, skippedRows, rounds);
        if (!saved.ok) return saved;
        notes.push(...saved.notes);
      }
    }

    // Screws, nuts and washers: from a parts list (ITEM NO. / PART NUMBER / QTY.).
    const hardwareForm = new FormData();
    hardwareForm.set("file", file);
    const hardware = await importHardwarePdf(planId, hardwareForm);
    if (hardware.success) {
      if (rounds > 1) await setHardwareFileRounds(planId, file.name.slice(0, 200), rounds);
      notes.push(`สกรู / น็อต / แหวน ${hardware.added} รายการ${rounds > 1 ? ` ×${rounds}` : ""}`);
    }

    if (notes.length === 0) {
      return {
        name,
        ok: false,
        notes: [],
        skipped,
        error: hardware.success ? "ไม่พบรายการ" : "ไม่พบตารางที่รู้จัก (ใบตัด: ITEM / QTY / DESCRIPTION / LENGTH หรือ parts list: ITEM NO. / PART NUMBER / QTY.)",
      };
    }
    return { name, ok: true, notes, skipped };
  } catch (error) {
    logError("Error in smart import:", error);
    return fail("อ่านไฟล์ไม่สำเร็จ");
  }
}

/** Saves the steel rows of one file (same file again = replaced) with the rounds counted. */
async function saveSteelRows(planId: string, fileName: string, parts: SteelPartInput[], skipped: SkippedRow[], rounds: number): Promise<SmartImportResult> {
  const sourceFile = fileName.replace(/\.[^.]+$/, "").slice(0, 200);
  const old = await prisma.steelPlanPart.findFirst({ where: { planId, sourceFile }, select: { rounds: true } });
  const times = old ? old.rounds : rounds;
  const rows = mergeParts(parts).map((p) => ({
    ...p,
    quantity: p.quantity * times,
    sourceFile,
    baseQuantity: p.quantity,
    rounds: times,
    sources: [sourceFile + (times > 1 ? ` ×${times}` : "")],
  }));
  await prisma.steelPlanPart.deleteMany({ where: { planId, sourceFile } });
  const result = await addSteelParts(planId, rows);
  revalidatePath(`/steel-cutting/${planId}`);
  if (!result.success) return { name: fileName, ok: false, notes: [], skipped, error: result.error };
  return { name: fileName, ok: true, notes: [`ใบตัดเหล็ก ${rows.length} รายการ${times > 1 ? ` ×${times}` : ""}`], skipped };
}
