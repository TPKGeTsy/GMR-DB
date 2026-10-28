"use server";

import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { checkRateLimit } from "@/lib/rateLimit";
import { canEditPlan } from "@/lib/steelAccess";
import { askGroqAboutImage } from "@/lib/groqVision";
import { BOM_IMAGE_PROMPT, angleFromRow, classifyBomRow, parseBomJson, type BomRow } from "@/lib/bomImage";
import { analyzeDxf, readDxfFileName, type DxfAnalysis } from "@/lib/dxf";
import { addSteelParts } from "./steel";

type Fail = { success: false; error: string };

const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // Groq's limit for a base64 picture
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_DXF_BYTES = 5 * 1024 * 1024;

function revalidatePlan(planId: string) {
  revalidatePath(`/steel-cutting/${planId}`);
}

/** Reads a picture of a parts list. Nothing is saved: the rows go back to the
 *  page to be checked and then saved with saveHardware. */
export async function readBomImage(formData: FormData): Promise<{ success: true; rows: BomRow[] } | Fail> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };
    const file = formData.get("file");
    if (!(file instanceof File)) return { success: false, error: "ไม่พบไฟล์" };
    if (!IMAGE_TYPES.includes(file.type)) return { success: false, error: "รองรับเฉพาะรูป PNG, JPG, WEBP" };
    if (file.size > MAX_IMAGE_BYTES) return { success: false, error: "รูปใหญ่เกิน 4 MB ลองย่อรูปหรือครอปเฉพาะตาราง" };

    const limit = await checkRateLimit(`readBomImage:${session.user.id}`, { maxAttempts: 12, windowMs: 60_000 });
    if (!limit.allowed) return { success: false, error: `อ่านรูปถี่เกินไป ลองใหม่ใน ${limit.retryAfterSeconds} วินาที` };

    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const reply = await askGroqAboutImage(BOM_IMAGE_PROMPT, `data:${file.type};base64,${base64}`);
    if (!reply.ok) return { success: false, error: reply.error };

    const rows = parseBomJson(reply.text);
    if (rows.length === 0) return { success: false, error: "อ่านตารางจากรูปไม่ได้ ลองรูปที่ชัดขึ้นหรือครอปเฉพาะตาราง" };
    return { success: true, rows };
  } catch (error) {
    logError("Error reading BOM image:", error);
    return { success: false, error: "อ่านรูปไม่สำเร็จ" };
  }
}

/** Saves the checked rows of the parts list; angles with a length can also be
 *  sent straight into the plan's pieces to cut. */
export async function saveHardware(planId: string, rows: BomRow[], sendSteel: boolean) {
  try {
    const check = await canEditPlan(planId);
    if (!("ok" in check)) return check;
    const clean = rows
      .filter((r) => r.partNumber.trim() && Number.isInteger(r.qty) && r.qty >= 1 && r.qty <= 1_000_000)
      .slice(0, 300);
    if (clean.length === 0) return { success: false as const, error: "ไม่มีรายการ" };

    await prisma.steelPlanHardware.createMany({
      data: clean.map((r) => ({
        planId,
        itemNo: r.item !== null && Number.isInteger(r.item) ? r.item : null,
        partNumber: r.partNumber.trim().slice(0, 200),
        description: r.description.trim().slice(0, 200),
        quantity: r.qty,
        category: classifyBomRow(r),
      })),
    });

    let sent = 0;
    if (sendSteel) {
      const angles = clean.map((r) => angleFromRow(r)).filter((p): p is NonNullable<typeof p> => p !== null);
      if (angles.length > 0) {
        const added = await addSteelParts(planId, angles.map((p) => ({ ...p, sources: ["รายการจากรูป"] })));
        if (added.success) sent = angles.length;
      }
    }
    revalidatePlan(planId);
    return { success: true as const, saved: clean.length, sent };
  } catch (error) {
    logError("Error saving hardware list:", error);
    return { success: false as const, error: "บันทึกรายการไม่สำเร็จ" };
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
