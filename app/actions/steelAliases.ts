"use server";

import prisma from "@/lib/prisma";
import { auth } from "@/auth";
import { logError } from "@/lib/logger";
import { STEEL_TYPES, isSteelType } from "@/lib/steel";

/** Teaches the reader a word of the drawings ("UPN" = channel): later files with it are read as that steel. */
export async function teachSteelAlias(keyword: string, steelType: string): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };
    const word = keyword.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9 .\-/]{0,29}$/.test(word) || word.length < 2) return { success: false, error: "คำต้องเป็นตัวอังกฤษ/ตัวเลข 2-30 ตัว" };
    if (!isSteelType(steelType) || !STEEL_TYPES[steelType].needsY) return { success: false, error: "เลือกได้เฉพาะเหล็กที่มีขนาด x, y" };
    await prisma.steelTypeAlias.upsert({
      where: { keyword: word },
      create: { keyword: word, steelType, createdById: session.user.id },
      update: { steelType },
    });
    return { success: true };
  } catch (error) {
    logError("Error teaching steel alias:", error);
    return { success: false, error: "บันทึกไม่สำเร็จ" };
  }
}
