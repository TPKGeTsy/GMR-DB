"use server";

import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { revalidatePath } from "next/cache";
import { checkRateLimit } from "@/lib/rateLimit";
import { canEditPlan } from "@/lib/steelAccess";
import { toScanImage } from "@/lib/scanImage";
import { saveDataUrlImage, deleteUploadedFile } from "@/lib/storage";
import { classifyBomRow, type BomRow } from "@/lib/bomImage";
import { analyzeDxf, readDxfFileName, type DxfAnalysis } from "@/lib/dxf";

type Fail = { success: false; error: string };

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_DXF_BYTES = 5 * 1024 * 1024;

function revalidatePlan(planId: string) {
  revalidatePath(`/steel-cutting/${planId}`);
}

/** Keeps a picture of a parts list (screws, nuts, washers...) with the plan, turned into a
 *  clean scan-like page that prints as a table. Nothing is read out of it. */
export async function addPartsListImage(planId: string, formData: FormData): Promise<{ success: true } | Fail> {
  try {
    const check = await canEditPlan(planId);
    if (!("ok" in check)) return check;
    const file = formData.get("file");
    if (!(file instanceof File)) return { success: false, error: "ไม่พบไฟล์" };
    if (!IMAGE_TYPES.includes(file.type)) return { success: false, error: "รองรับเฉพาะรูป PNG, JPG, WEBP" };
    if (file.size > MAX_IMAGE_BYTES) return { success: false, error: "รูปใหญ่เกิน 8 MB" };
    const limit = await checkRateLimit(`partsListImage:${check.userId}`, { maxAttempts: 20, windowMs: 60_000 });
    if (!limit.allowed) return { success: false, error: `อัปโหลดถี่เกินไป ลองใหม่ใน ${limit.retryAfterSeconds} วินาที` };

    const scan = await toScanImage(Buffer.from(await file.arrayBuffer()));
    const fileUrl = await saveDataUrlImage(`data:image/png;base64,${scan.toString("base64")}`, `steel-plans/${planId}`);
    await prisma.steelPlanImage.create({ data: { planId, fileUrl, fileName: file.name.slice(0, 200) } });
    revalidatePlan(planId);
    return { success: true };
  } catch (error) {
    logError("Error saving parts-list image:", error);
    return { success: false, error: "บันทึกรูปไม่สำเร็จ" };
  }
}

export async function deletePartsListImage(id: string) {
  try {
    const image = await prisma.steelPlanImage.findUnique({ where: { id } });
    if (!image) return { success: false, error: "ไม่พบรูป" };
    const check = await canEditPlan(image.planId);
    if (!("ok" in check)) return check;
    await prisma.steelPlanImage.delete({ where: { id } });
    await deleteUploadedFile(image.fileUrl);
    revalidatePlan(image.planId);
    return { success: true };
  } catch (error) {
    logError("Error deleting parts-list image:", error);
    return { success: false, error: "ลบรูปไม่สำเร็จ" };
  }
}

/** Removes the whole picture-list from a plan (the rows were added by mistake or are outdated). */
export async function deleteAllHardware(planId: string) {
  try {
    const check = await canEditPlan(planId);
    if (!("ok" in check)) return check;
    await prisma.steelPlanHardware.deleteMany({ where: { planId } });
    revalidatePlan(planId);
    return { success: true };
  } catch (error) {
    logError("Error deleting all hardware rows:", error);
    return { success: false, error: "ลบรายการไม่สำเร็จ" };
  }
}

/** Fixes a saved row of the parts list (a wrong part number or quantity read from the picture). */
export async function updateHardwareRow(id: string, data: { partNumber: string; description: string; quantity: number }) {
  try {
    const row = await prisma.steelPlanHardware.findUnique({ where: { id }, select: { planId: true } });
    if (!row) return { success: false, error: "ไม่พบรายการ" };
    const check = await canEditPlan(row.planId);
    if (!("ok" in check)) return check;
    const partNumber = data.partNumber.trim().slice(0, 200);
    if (!partNumber) return { success: false, error: "ต้องมี part number" };
    if (!Number.isInteger(data.quantity) || data.quantity < 1 || data.quantity > 1_000_000) return { success: false, error: "QTY ไม่ถูกต้อง" };
    const candidate: BomRow = { item: null, partNumber, description: data.description.trim().slice(0, 200), qty: data.quantity };
    await prisma.steelPlanHardware.update({
      where: { id },
      data: { partNumber, description: candidate.description, quantity: data.quantity, category: classifyBomRow(candidate) },
    });
    revalidatePlan(row.planId);
    return { success: true };
  } catch (error) {
    logError("Error updating hardware row:", error);
    return { success: false, error: "บันทึกไม่สำเร็จ" };
  }
}

export async function deleteHardwareRow(id: string) {
  try {
    const row = await prisma.steelPlanHardware.findUnique({ where: { id }, select: { planId: true } });
    if (!row) return { success: false, error: "ไม่พบรายการ" };
    const check = await canEditPlan(row.planId);
    if (!("ok" in check)) return check;
    await prisma.steelPlanHardware.delete({ where: { id } });
    revalidatePlan(row.planId);
    return { success: true };
  } catch (error) {
    logError("Error deleting hardware row:", error);
    return { success: false, error: "ลบรายการไม่สำเร็จ" };
  }
}

/** Reads a DXF flat pattern and saves it as a part of the plan. */
export async function addDxfPart(planId: string, formData: FormData): Promise<{ success: true; name: string } | Fail> {
  try {
    const check = await canEditPlan(planId);
    if (!("ok" in check)) return check;
    const file = formData.get("file");
    if (!(file instanceof File)) return { success: false, error: "ไม่พบไฟล์" };
    if (file.size > MAX_DXF_BYTES) return { success: false, error: `${file.name}: ไฟล์ใหญ่เกิน 5 MB` };
    const text = await file.text();
    if (!/\bSECTION\b/.test(text) || !/\bENTITIES\b/.test(text)) return { success: false, error: `${file.name}: ไม่ใช่ไฟล์ DXF แบบข้อความ` };

    const analysis: DxfAnalysis | null = analyzeDxf(text);
    if (!analysis) return { success: false, error: `${file.name}: ไม่พบเส้นรอบนอกที่ปิดครบ (ไม่ใช่รูปคลี่แผ่น)` };
    const { name, quantity } = readDxfFileName(file.name);

    await prisma.steelPlanSheetPart.create({
      data: {
        planId,
        name: name.slice(0, 200),
        sourceFile: file.name.slice(0, 200),
        width: analysis.width,
        height: analysis.height,
        quantity,
        features: JSON.parse(JSON.stringify(analysis.features.map((f) => ({ kind: f.kind, size: f.size, center: f.center })))),
        steps: JSON.parse(JSON.stringify(analysis.steps)),
        geometry: JSON.parse(JSON.stringify(analysis.geometry)),
      },
    });
    revalidatePlan(planId);
    return { success: true, name };
  } catch (error) {
    logError("Error adding DXF part:", error);
    return { success: false, error: "อ่านไฟล์ DXF ไม่สำเร็จ" };
  }
}

export async function updateSheetPart(id: string, data: { thickness: number | null; quantity: number }) {
  try {
    const row = await prisma.steelPlanSheetPart.findUnique({ where: { id }, select: { planId: true } });
    if (!row) return { success: false, error: "ไม่พบรายการ" };
    const check = await canEditPlan(row.planId);
    if (!("ok" in check)) return check;
    if (data.thickness !== null && !(data.thickness > 0 && data.thickness <= 500)) return { success: false, error: "ความหนาไม่ถูกต้อง" };
    if (!Number.isInteger(data.quantity) || data.quantity < 1 || data.quantity > 10000) return { success: false, error: "จำนวนไม่ถูกต้อง" };
    await prisma.steelPlanSheetPart.update({ where: { id }, data: { thickness: data.thickness, quantity: data.quantity } });
    revalidatePlan(row.planId);
    return { success: true };
  } catch (error) {
    logError("Error updating sheet part:", error);
    return { success: false, error: "บันทึกไม่สำเร็จ" };
  }
}

export async function deleteSheetPart(id: string) {
  try {
    const row = await prisma.steelPlanSheetPart.findUnique({ where: { id }, select: { planId: true } });
    if (!row) return { success: false, error: "ไม่พบรายการ" };
    const check = await canEditPlan(row.planId);
    if (!("ok" in check)) return check;
    await prisma.steelPlanSheetPart.delete({ where: { id } });
    revalidatePlan(row.planId);
    return { success: true };
  } catch (error) {
    logError("Error deleting sheet part:", error);
    return { success: false, error: "ลบรายการไม่สำเร็จ" };
  }
}

/** Sets how many times a nested sheet layout has been cut (the "Done x/y" counter). */
export async function setNestDone(planId: string, signature: string, done: number) {
  try {
    const check = await canEditPlan(planId);
    if (!("ok" in check)) return check;
    if (!/^[\w.-]{1,120}$/.test(signature)) return { success: false, error: "ข้อมูลไม่ถูกต้อง" };
    if (!Number.isInteger(done) || done < 0 || done > 10000) return { success: false, error: "จำนวนไม่ถูกต้อง" };
    await prisma.steelPlanNestDone.upsert({
      where: { planId_signature: { planId, signature } },
      create: { planId, signature, done },
      update: { done },
    });
    revalidatePlan(planId);
    return { success: true };
  } catch (error) {
    logError("Error saving nest done count:", error);
    return { success: false, error: "บันทึกไม่สำเร็จ" };
  }
}
