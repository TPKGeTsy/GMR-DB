import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rateLimit";
import { verifyLineSignature, replyLineMessage } from "@/lib/line";
import type { Asset, LinePendingBorrow, User } from "@prisma/client";

interface LineWebhookEvent {
  type: string;
  replyToken?: string;
  source?: { type: string; userId?: string };
  message?: { type: string; text?: string };
}

const DEFAULT_LOAN_DAYS = 7;
const PENDING_EXPIRY_MS = 10 * 60 * 1000;
const CONFIRM_WORDS = new Set(["ยืนยัน", "yes", "y", "ใช่", "ตกลง", "โอเค", "ok"]);
const CANCEL_WORDS = new Set(["ยกเลิก", "no", "n", "cancel"]);
// "ยืม <ชื่ออุปกรณ์> <จำนวน>" — e.g. "ยืม สว่านไฟฟ้า 2"
const BORROW_COMMAND = /^ยืม\s+(.+?)\s+(\d+)\s*$/;

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature");

  if (!verifyLineSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let events: LineWebhookEvent[] = [];
  try {
    events = JSON.parse(rawBody).events || [];
  } catch (error) {
    logError("LINE webhook: invalid JSON body", error);
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // LINE expects a fast 200 OK; each event is handled independently so one
  // failure doesn't block the others, and errors are logged, not thrown.
  await Promise.all(
    events.map((event) => handleEvent(event).catch((error) => logError("LINE event handling failed", error)))
  );

  return NextResponse.json({ success: true });
}

async function handleEvent(event: LineWebhookEvent) {
  if (event.type !== "message" || event.message?.type !== "text") return;

  const lineUserId = event.source?.userId;
  const replyToken = event.replyToken;
  if (!lineUserId || !replyToken) return;

  const text = event.message.text?.trim() ?? "";
  if (!text) return;

  const rateLimit = await checkRateLimit(`line:${lineUserId}`, { maxAttempts: 20, windowMs: 60_000 });
  if (!rateLimit.allowed) {
    await replyLineMessage(replyToken, `ส่งข้อความถี่เกินไปครับ กรุณารออีก ${rateLimit.retryAfterSeconds} วินาที`);
    return;
  }

  const user = await prisma.user.findUnique({ where: { lineUserId } });
  if (!user) {
    await handleLinkAccount(lineUserId, text, replyToken);
    return;
  }

  const pending = await prisma.linePendingBorrow.findUnique({ where: { lineUserId }, include: { asset: true } });
  const normalized = text.toLowerCase();

  if (pending) {
    const isExpired = Date.now() - pending.createdAt.getTime() > PENDING_EXPIRY_MS;

    if (!isExpired && CONFIRM_WORDS.has(normalized)) {
      await confirmBorrow(user, pending, replyToken);
      return;
    }

    if (CANCEL_WORDS.has(normalized)) {
      await prisma.linePendingBorrow.delete({ where: { lineUserId } }).catch(() => {});
      await replyLineMessage(replyToken, "ยกเลิกคำสั่งยืมแล้วครับ");
      return;
    }

    if (isExpired) {
      await prisma.linePendingBorrow.delete({ where: { lineUserId } }).catch(() => {});
    }
  }

  const match = text.match(BORROW_COMMAND);
  if (match) {
    await handleBorrowCommand(lineUserId, match[1].trim(), Number(match[2]), replyToken);
    return;
  }

  await replyLineMessage(
    replyToken,
    pending
      ? `มีคำสั่งยืม "${pending.asset.name}" ค้างรอยืนยันอยู่ครับ พิมพ์ "ยืนยัน" หรือ "ยกเลิก"`
      : `พิมพ์ "ยืม <ชื่ออุปกรณ์> <จำนวน>" เพื่อยืมของครับ เช่น "ยืม สว่าน 2"`
  );
}

async function handleLinkAccount(lineUserId: string, text: string, replyToken: string) {
  const username = text.trim();
  const user = await prisma.user.findUnique({ where: { username } });

  if (!user) {
    await replyLineMessage(
      replyToken,
      `ไม่พบชื่อผู้ใช้ "${username}" ในระบบครับ กรุณาพิมพ์ username ที่ใช้ login เว็บ GMR AssetManager เพื่อผูกบัญชีก่อนครับ`
    );
    return;
  }

  if (user.lineUserId && user.lineUserId !== lineUserId) {
    await replyLineMessage(replyToken, "บัญชีนี้ถูกผูกกับ LINE อีกแอคเคาท์ไปแล้วครับ ถ้าต้องการเปลี่ยนกรุณาติดต่อแอดมิน");
    return;
  }

  await prisma.user.update({ where: { id: user.id }, data: { lineUserId } });

  await replyLineMessage(
    replyToken,
    `ผูกบัญชีกับ "${user.fullName || user.username}" เรียบร้อยครับ ✅\nพิมพ์ "ยืม <ชื่ออุปกรณ์> <จำนวน>" เพื่อยืมของได้เลย เช่น "ยืม สว่าน 2"`
  );
}

async function handleBorrowCommand(lineUserId: string, assetQuery: string, quantity: number, replyToken: string) {
  if (!Number.isInteger(quantity) || quantity < 1) {
    await replyLineMessage(replyToken, "จำนวนไม่ถูกต้องครับ");
    return;
  }

  const matches = await prisma.asset.findMany({
    where: {
      OR: [
        { name: { contains: assetQuery, mode: "insensitive" } },
        { modelOrSize: { contains: assetQuery, mode: "insensitive" } },
      ],
    },
    take: 6,
  });

  if (matches.length === 0) {
    await replyLineMessage(replyToken, `ไม่พบอุปกรณ์ชื่อ "${assetQuery}" ในระบบครับ ลองพิมพ์ชื่อให้ตรงกับในเว็บดูนะครับ`);
    return;
  }

  if (matches.length > 1) {
    const list = matches.map((a: Asset) => `• ${a.name} (${a.modelOrSize})`).join("\n");
    await replyLineMessage(replyToken, `พบหลายรายการที่ตรงกับ "${assetQuery}":\n${list}\n\nกรุณาพิมพ์ชื่อให้ตรงมากขึ้นครับ`);
    return;
  }

  const asset = matches[0];
  if (asset.quantity < quantity) {
    await replyLineMessage(replyToken, `${asset.name} เหลือไม่พอครับ (คงเหลือ ${asset.quantity} ${asset.unit})`);
    return;
  }

  await prisma.linePendingBorrow.upsert({
    where: { lineUserId },
    create: { lineUserId, assetId: asset.id, quantity },
    update: { assetId: asset.id, quantity, createdAt: new Date() },
  });

  await replyLineMessage(
    replyToken,
    `ยืม ${asset.name} (${asset.modelOrSize}) จำนวน ${quantity} ${asset.unit} ใช่ไหมครับ?\nพิมพ์ "ยืนยัน" เพื่อยืนยัน หรือ "ยกเลิก"`
  );
}

async function confirmBorrow(
  user: User,
  pending: LinePendingBorrow & { asset: Asset },
  replyToken: string
) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const asset = await tx.asset.findUnique({ where: { id: pending.assetId } });
      if (!asset) throw new Error("ไม่พบอุปกรณ์นี้แล้วครับ อาจถูกลบไปจากระบบ");
      if (asset.quantity < pending.quantity) {
        throw new Error(`ของเหลือไม่พอแล้วครับ (คงเหลือ ${asset.quantity} ${asset.unit})`);
      }

      await tx.asset.update({ where: { id: asset.id }, data: { quantity: asset.quantity - pending.quantity } });

      const dueDate = new Date(Date.now() + DEFAULT_LOAN_DAYS * 24 * 60 * 60 * 1000);
      const loan = await tx.loan.create({
        data: { assetId: asset.id, userId: user.id, quantity: pending.quantity, dueDate },
      });

      await tx.activityLog.create({
        data: {
          userId: user.id,
          action: "BORROW_ASSET",
          details: `Borrowed ${pending.quantity} x ${asset.name} (${asset.modelOrSize}) via LINE`,
        },
      });

      await tx.linePendingBorrow.delete({ where: { lineUserId: pending.lineUserId } });

      return { asset, loan };
    });

    revalidatePath("/catalog");
    revalidatePath("/my-loans");
    revalidatePath("/inventory");
    revalidatePath("/dashboard");

    await replyLineMessage(
      replyToken,
      `บันทึกการยืม ${result.asset.name} x${pending.quantity} ${result.asset.unit} เรียบร้อยแล้วครับ ✅ กำหนดคืนภายใน ${DEFAULT_LOAN_DAYS} วัน`
    );
  } catch (error) {
    logError("LINE confirmBorrow failed", error, { userId: user.id, assetId: pending.assetId });
    const message = error instanceof Error ? error.message : "ยืมของไม่สำเร็จครับ";
    await replyLineMessage(replyToken, message);
    await prisma.linePendingBorrow.delete({ where: { lineUserId: pending.lineUserId } }).catch(() => {});
  }
}
