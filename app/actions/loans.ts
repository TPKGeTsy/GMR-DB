"use server";

import prisma from "@/lib/prisma";
import { auth } from "@/auth";
import { createActivityLog } from "./auth";
import { revalidatePath } from "next/cache";

export async function borrowAsset(assetId: string, quantity: number) {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "กรุณาเข้าสู่ระบบก่อนยืมของ" };

    if (!Number.isInteger(quantity) || quantity < 1) {
      return { success: false, error: "จำนวนไม่ถูกต้อง" };
    }

    const result = await prisma.$transaction(async (tx) => {
      const asset = await tx.asset.findUnique({ where: { id: assetId } });
      if (!asset) throw new Error("ไม่พบอุปกรณ์นี้");
      if (asset.quantity < quantity) throw new Error(`มีของเหลือไม่พอ (คงเหลือ ${asset.quantity} ${asset.unit})`);

      await tx.asset.update({
        where: { id: assetId },
        data: { quantity: asset.quantity - quantity },
      });

      const loan = await tx.loan.create({
        data: { assetId, userId: session.user.id!, quantity },
      });

      return { asset, loan };
    });

    await createActivityLog(
      "BORROW_ASSET",
      `Borrowed ${quantity} x ${result.asset.name} (${result.asset.modelOrSize})`
    );

    revalidatePath("/catalog");
    revalidatePath("/my-loans");
    revalidatePath("/inventory");
    revalidatePath("/dashboard");

    return { success: true, data: JSON.parse(JSON.stringify(result.loan)) };
  } catch (error) {
    console.error("Error borrowing asset:", error);
    const message = error instanceof Error ? error.message : "ยืมของไม่สำเร็จ";
    return { success: false, error: message };
  }
}

export async function returnLoan(loanId: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };

    const result = await prisma.$transaction(async (tx) => {
      const loan = await tx.loan.findUnique({ where: { id: loanId }, include: { asset: true } });
      if (!loan) throw new Error("ไม่พบรายการยืมนี้");
      if (loan.returnedAt) throw new Error("คืนของรายการนี้ไปแล้ว");
      if (loan.userId !== session.user.id && session.user.role !== "ADMIN") {
        throw new Error("Unauthorized");
      }

      await tx.asset.update({
        where: { id: loan.assetId },
        data: { quantity: loan.asset.quantity + loan.quantity },
      });

      const updatedLoan = await tx.loan.update({
        where: { id: loanId },
        data: { returnedAt: new Date() },
      });

      return { loan: updatedLoan, assetName: loan.asset.name };
    });

    await createActivityLog("RETURN_ASSET", `Returned ${result.loan.quantity} x ${result.assetName}`);

    revalidatePath("/catalog");
    revalidatePath("/my-loans");
    revalidatePath("/inventory");
    revalidatePath("/dashboard");

    return { success: true };
  } catch (error) {
    console.error("Error returning loan:", error);
    const message = error instanceof Error ? error.message : "คืนของไม่สำเร็จ";
    return { success: false, error: message };
  }
}

export async function getActiveLoans() {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };

    const loans = await prisma.loan.findMany({
      where: { returnedAt: null },
      orderBy: { borrowedAt: "desc" },
      include: {
        asset: { select: { name: true, modelOrSize: true, unit: true } },
        user: { select: { username: true, fullName: true } },
      },
    });

    return { success: true, data: JSON.parse(JSON.stringify(loans)) };
  } catch (error) {
    console.error("Error fetching active loans:", error);
    return { success: false, error: "Failed to load active loans" };
  }
}

export async function getMyLoans() {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };

    const loans = await prisma.loan.findMany({
      where: { userId: session.user.id },
      orderBy: { borrowedAt: "desc" },
      include: { asset: true },
    });

    return { success: true, data: JSON.parse(JSON.stringify(loans)) };
  } catch (error) {
    console.error("Error fetching loans:", error);
    return { success: false, error: "Failed to load loans" };
  }
}
