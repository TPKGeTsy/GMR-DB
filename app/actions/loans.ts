"use server";

import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { auth } from "@/auth";
import { createActivityLog } from "./auth";
import { revalidatePath } from "next/cache";
import { checkRateLimit } from "@/lib/rateLimit";
import { notifyAdminsFYI } from "@/lib/lineApprovals";

const DEFAULT_LOAN_DAYS = 7;

export async function borrowAsset(assetId: string, quantity: number) {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "กรุณาเข้าสู่ระบบก่อนยืมของ" };

    const rateLimit = await checkRateLimit(`borrowAsset:${session.user.id}`, { maxAttempts: 20, windowMs: 60_000 });
    if (!rateLimit.allowed) {
      return { success: false, error: `ยืมของถี่เกินไป กรุณารออีก ${rateLimit.retryAfterSeconds} วินาที` };
    }

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

      const isConsume = asset.issueType === "CONSUME";
      // A CONSUME item (เบิก) is taken permanently — the Loan row is created
      // already "returned" (same instant) so it never shows up as something
      // to return, and its stock deduction is never reversed by returnLoan
      // (which refuses to touch an already-returned loan).
      const now = new Date();
      const loan = await tx.loan.create({
        data: {
          assetId,
          userId: session.user.id!,
          quantity,
          dueDate: isConsume ? null : new Date(now.getTime() + DEFAULT_LOAN_DAYS * 24 * 60 * 60 * 1000),
          returnedAt: isConsume ? now : null,
        },
      });

      return { asset, loan, isConsume };
    });

    await createActivityLog(
      result.isConsume ? "CONSUME_ASSET" : "BORROW_ASSET",
      `${result.isConsume ? "Requisitioned" : "Borrowed"} ${quantity} x ${result.asset.name} (${result.asset.modelOrSize})`
    );
    await notifyAdminsFYI(
      `📦 ${session.user.name || session.user.username} ${result.isConsume ? "เบิก" : "ยืม"} ${result.asset.name} (${result.asset.modelOrSize}) x${quantity} ${result.asset.unit}`
    );

    revalidatePath("/catalog");
    revalidatePath("/my-loans");
    revalidatePath("/inventory");
    revalidatePath("/dashboard");

    return { success: true, data: JSON.parse(JSON.stringify(result.loan)) };
  } catch (error) {
    logError("Error borrowing asset:", error);
    const message = error instanceof Error ? error.message : "ยืมของไม่สำเร็จ";
    return { success: false, error: message };
  }
}

export async function returnLoan(loanId: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };

    const result = await prisma.$transaction(async (tx) => {
      const loan = await tx.loan.findUnique({
        where: { id: loanId },
        include: { asset: true, user: { select: { username: true, fullName: true } } },
      });
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

      return { loan: updatedLoan, assetName: loan.asset.name, borrowerName: loan.user.fullName || loan.user.username };
    });

    await createActivityLog("RETURN_ASSET", `Returned ${result.loan.quantity} x ${result.assetName}`);
    await notifyAdminsFYI(`↩️ ${result.borrowerName} คืน ${result.assetName} x${result.loan.quantity} แล้วค่ะ`);

    revalidatePath("/catalog");
    revalidatePath("/my-loans");
    revalidatePath("/inventory");
    revalidatePath("/dashboard");

    return { success: true };
  } catch (error) {
    logError("Error returning loan:", error);
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
    logError("Error fetching active loans:", error);
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
    logError("Error fetching loans:", error);
    return { success: false, error: "Failed to load loans" };
  }
}
