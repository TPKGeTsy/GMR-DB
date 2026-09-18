import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rateLimit";
import { verifyLineSignature, replyLineMessage, pushLineMessage, type QuickReplyOption } from "@/lib/line";
import { answerFreeformQuestion, extractBorrowIntent } from "@/lib/lineAssistant";
import { notifyAdminsFYI, notifyUser } from "@/lib/lineApprovals";
import { formatThaiDate, formatThaiDateTime } from "@/lib/datetime";
import { REGULAR_HOURS_CAP, LUNCH_BREAK_HOURS } from "@/lib/attendance";
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
// Same, but with the quantity left out — e.g. just "ยืม สว่าน". Checked only
// after BORROW_COMMAND fails to match, so it's the "no number given" case,
// not a stricter alternative to it.
const BORROW_NAME_ONLY = /^ยืม\s+(.+)$/;
// -1 on a LinePendingBorrow row is a sentinel: the asset is chosen but the
// quantity isn't yet, so the very next bare-number reply completes it. A
// real borrow's quantity is always >= 1 (enforced before it's ever stored),
// so this can't collide with a genuine pending confirmation.
const AWAITING_QUANTITY = -1;
const BARE_NUMBER = /^\d+$/;
const END_WORK_TEXT = "เลิกงานแล้ว";
const CONTINUE_OT_TEXT = "ทำ OT ต่อ";
// The hidden `text` payload behind an admin's "✅ อนุมัติ"/"❌ ปฏิเสธ" Quick
// Reply button on a pending-approval push — see lib/lineApprovals.ts.
const APPROVAL_COMMAND = /^(APPROVE|REJECT)_(LEAVE|BOOKING):(.+)$/;
// The hidden `text` payload behind one of the "พบหลายรายการ" disambiguation
// buttons — see handleBorrowCommand. Encodes the exact asset id so picking
// one is a single tap with no retyping and no re-triggering the same
// name-collision the buttons exist to resolve.
const SELECT_ASSET_COMMAND = /^SELECT_ASSET:(.+):(\d+)$/;
// Admin/operator-only: opens OT for someone checked in at the office instead
// of the old self-serve ask. Two-step button flow, each step's payload
// carrying everything the next step needs — no server-side state between
// taps, same pattern as SELECT_ASSET_COMMAND above.
// Matched with all whitespace stripped and lowercased (see normalizeCommand)
// so "เปิด OT", "เปิดOT", and "เปิด  ot" all trigger it the same way —
// phones' autocorrect/spacing is inconsistent enough that a strict match
// silently fell through to the general AI Q&A fallback instead.
const OT_GRANT_TRIGGER_NORMALIZED = "เปิดot";
const OT_PICK_COMMAND = /^OT_PICK:(.+)$/;
// Hours picked — this doesn't finalize the grant yet, it just moves to
// asking for a reason (see LinePendingOtGrant / the awaitingOtGrantReason
// check in handleEvent).
const OT_GRANT_COMMAND = /^OT_GRANT:(.+):(\d+(?:\.\d+)?)$/;
const OT_HOUR_OPTIONS = [1, 2, 3, 4];
// When OT starts counting from, for turning granted hours into an actual
// WorkSchedule time block — same 8-worked-hours-plus-untracked-lunch mark
// the reminder cron uses to decide when to auto-checkout.
const EXPECTED_SPAN_MS = (REGULAR_HOURS_CAP + LUNCH_BREAK_HOURS) * 3_600_000;

function normalizeCommand(text: string): string {
  return text.replace(/\s+/g, "").toLowerCase();
}
const leaveTypeLabel: Record<string, string> = { SICK: "ลาป่วย", PERSONAL: "ลากิจ", VACATION: "ลาพักร้อน" };

// Strips stray trailing punctuation (backticks, quotes, markdown-ish
// asterisks) that phone keyboards/autocorrect sometimes tack on — without
// this, "ยืม Relay `" searches for the literal substring "Relay `", which
// matches nothing even though "Relay" alone would.
function sanitizeQuery(raw: string): string {
  return raw.trim().replace(/[`'"*_~]+$/g, "").trim();
}

// A person can only have one open "IN" session at a time (recordCheckIn
// enforces this for the face-scan kiosk too) — so the latest CheckIn row
// being type "IN" reliably means they're still clocked in right now.
async function getOpenCheckIn(userId: string) {
  const latest = await prisma.checkIn.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
  return latest?.type === "IN" ? latest : null;
}

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
    await replyLineMessage(replyToken, `ส่งข้อความถี่เกินไปค่ะ กรุณารออีก ${rateLimit.retryAfterSeconds} วินาทีนะคะ`);
    return;
  }

  const user = await prisma.user.findUnique({ where: { lineUserId } });
  if (!user) {
    // Only allow the username+password link step in a private 1:1 chat —
    // typing a password in a group would expose it to everyone in it.
    if (event.source?.type !== "user") {
      await replyLineMessage(replyToken, "กรุณาทักแชทส่วนตัวกับบอทเพื่อผูกบัญชีนะคะ 🙏");
      return;
    }
    await handleLinkAccount(lineUserId, text, replyToken);
    return;
  }

  const normalized = text.toLowerCase();
  const openCheckIn = await getOpenCheckIn(user.id);

  // The very next message after tapping "ทำ OT ต่อ" is taken as the OT
  // reason (unless it's a cancel word) and folded into that session's note
  // — never routed through the borrow/Q&A logic below.
  if (openCheckIn?.awaitingOtReason) {
    if (CANCEL_WORDS.has(normalized)) {
      await prisma.checkIn.update({ where: { id: openCheckIn.id }, data: { awaitingOtReason: false } });
      await replyLineMessage(replyToken, "โอเคค่ะ ไม่บันทึกเหตุผลก็ได้ค่ะ สู้ๆ นะคะ 💪");
      return;
    }

    const reason = text.slice(0, 300);
    const combinedNote = openCheckIn.note ? `${openCheckIn.note} | OT: ${reason}` : `OT: ${reason}`;
    await prisma.checkIn.update({
      where: { id: openCheckIn.id },
      data: { note: combinedNote, awaitingOtReason: false },
    });
    revalidatePath("/attendance");
    await replyLineMessage(
      replyToken,
      "บันทึกเหตุผล OT แล้วค่ะ สู้ๆ นะคะ 💪 พอเลิกงานจริงพิมพ์ \"เลิกงานแล้ว\" มาบอกได้เลยค่ะ"
    );
    return;
  }

  // The very next message from an admin/operator after picking OT hours for
  // someone is taken as the reason (unless it's a cancel word), which
  // finalizes the grant. Keyed by the *operator's* lineUserId — independent
  // of whatever their own attendance state is.
  const pendingOtGrant = await prisma.linePendingOtGrant.findUnique({ where: { lineUserId } });
  if (pendingOtGrant) {
    const isExpired = Date.now() - pendingOtGrant.createdAt.getTime() > PENDING_EXPIRY_MS;
    if (isExpired) {
      await prisma.linePendingOtGrant.delete({ where: { id: pendingOtGrant.id } });
    } else if (CANCEL_WORDS.has(normalized)) {
      await prisma.linePendingOtGrant.delete({ where: { id: pendingOtGrant.id } });
      await replyLineMessage(replyToken, "ยกเลิกการเปิด OT แล้วค่ะ");
      return;
    } else {
      await finalizeOtGrant(user, pendingOtGrant, text.slice(0, 300), replyToken);
      return;
    }
  }

  if (text === END_WORK_TEXT) {
    if (!openCheckIn) {
      await replyLineMessage(replyToken, "ดูเหมือนว่าคุณเช็คเอาท์ไปแล้วนะคะ ไม่มีการเช็คอินที่เปิดอยู่ค่ะ");
      return;
    }

    await prisma.checkIn.create({
      data: { userId: user.id, type: "OUT", location: openCheckIn.location, confidence: null },
    });
    await prisma.activityLog.create({
      data: { userId: user.id, action: "CHECK_OUT", details: "Checked out via LINE bot (no photo)" },
    });
    revalidatePath(`/users/${user.id}`);
    revalidatePath("/attendance");
    await replyLineMessage(replyToken, "บันทึกเช็คเอาท์เรียบร้อยค่ะ ✅ พักผ่อนเยอะๆ นะคะ วันนี้เหนื่อยแล้ว");
    return;
  }

  if (text === CONTINUE_OT_TEXT) {
    if (!openCheckIn) {
      await replyLineMessage(replyToken, "ดูเหมือนว่าคุณเช็คเอาท์ไปแล้วนะคะ");
      return;
    }

    await prisma.checkIn.update({
      where: { id: openCheckIn.id },
      data: { awaitingOtReason: true, otConfirmedAt: openCheckIn.otConfirmedAt ?? new Date() },
    });
    await replyLineMessage(replyToken, "โอเคค่ะ สู้ๆ นะคะ 💪 ขอเหตุผลที่ทำ OT หน่อยค่ะ (จะบันทึกในหมายเหตุ)");
    return;
  }

  const approvalMatch = text.match(APPROVAL_COMMAND);
  if (approvalMatch) {
    const [, decision, kind, id] = approvalMatch;
    await handleApprovalDecision(user, decision as "APPROVE" | "REJECT", kind as "LEAVE" | "BOOKING", id, replyToken);
    return;
  }

  const selectMatch = text.match(SELECT_ASSET_COMMAND);
  if (selectMatch) {
    await handleSelectAsset(lineUserId, selectMatch[1], Number(selectMatch[2]), replyToken);
    return;
  }

  const isOtManager = user.role === "ADMIN" || user.role === "OPERATOR";

  if (normalizeCommand(text) === OT_GRANT_TRIGGER_NORMALIZED) {
    if (!isOtManager) {
      await replyLineMessage(replyToken, "คำสั่งนี้ใช้ได้เฉพาะแอดมิน/ผู้ดูแลระบบเท่านั้นค่ะ");
      return;
    }
    await handleOtGrantStart(replyToken);
    return;
  }

  const otPickMatch = text.match(OT_PICK_COMMAND);
  if (otPickMatch) {
    if (!isOtManager) return;
    await handleOtPick(otPickMatch[1], replyToken);
    return;
  }

  const otGrantMatch = text.match(OT_GRANT_COMMAND);
  if (otGrantMatch) {
    if (!isOtManager) return;
    await handleOtHoursPicked(lineUserId, otGrantMatch[1], Number(otGrantMatch[2]), replyToken);
    return;
  }

  const pending = await prisma.linePendingBorrow.findUnique({ where: { lineUserId }, include: { asset: true } });
  const awaitingQuantity = pending?.quantity === AWAITING_QUANTITY;

  if (pending) {
    const isExpired = Date.now() - pending.createdAt.getTime() > PENDING_EXPIRY_MS;

    if (!isExpired && awaitingQuantity && BARE_NUMBER.test(text)) {
      await finalizeQuantity(pending, Number(text), replyToken);
      return;
    }

    // A non-numeric reply while a quantity is pending might still say one in
    // words ("เอาสัก 3 อัน", "สองตัวพอ") — ask the model to read just the
    // number out of it, but only when the message doesn't itself look like
    // the user starting an entirely new "ยืม ..." request (that's handled
    // further down, and should override this pending item, not answer for it).
    if (!isExpired && awaitingQuantity && !CANCEL_WORDS.has(normalized) && !/^ยืม\s/.test(text)) {
      const intent = await extractBorrowIntent(
        text,
        `ผู้ใช้เพิ่งถูกถามว่าจะยืม "${pending.asset.name}" กี่${pending.asset.unit} — ข้อความนี้ควรเป็นคำตอบเรื่องจำนวนเท่านั้น`
      );
      if (intent?.quantity) {
        await finalizeQuantity(pending, intent.quantity, replyToken);
        return;
      }
      await replyLineMessage(replyToken, `จะยืม "${pending.asset.name}" กี่${pending.asset.unit}คะ? พิมพ์เป็นตัวเลขได้เลยค่ะ`);
      return;
    }

    if (!isExpired && !awaitingQuantity && CONFIRM_WORDS.has(normalized)) {
      await confirmBorrow(user, pending, replyToken);
      return;
    }

    if (CANCEL_WORDS.has(normalized)) {
      await prisma.linePendingBorrow.delete({ where: { lineUserId } }).catch(() => {});
      await replyLineMessage(replyToken, "ยกเลิกคำสั่งยืมแล้วค่ะ");
      return;
    }

    if (isExpired) {
      await prisma.linePendingBorrow.delete({ where: { lineUserId } }).catch(() => {});
    }
  }

  const match = text.match(BORROW_COMMAND);
  if (match) {
    await handleBorrowCommand(lineUserId, sanitizeQuery(match[1]), Number(match[2]), replyToken);
    return;
  }

  const nameOnlyMatch = text.match(BORROW_NAME_ONLY);
  if (nameOnlyMatch) {
    await handleBorrowSearch(lineUserId, sanitizeQuery(nameOnlyMatch[1]), replyToken);
    return;
  }

  // Doesn't match the strict "ยืม ..." command at all — see if it reads as
  // one anyway in natural language (e.g. "ขอยืมสว่านหน่อยครับ 2 ตัว"). Only
  // extracts the item/quantity; the actual search, disambiguation, and
  // required "ยืนยัน" confirmation are identical to the strict-command path.
  const borrowIntent = await extractBorrowIntent(text);
  if (borrowIntent?.isBorrowRequest && borrowIntent.item) {
    if (borrowIntent.quantity) {
      await handleBorrowCommand(lineUserId, borrowIntent.item, borrowIntent.quantity, replyToken);
    } else {
      await handleBorrowSearch(lineUserId, borrowIntent.item, replyToken);
    }
    return;
  }

  // Anything else is treated as a free-form question, answered from the
  // user's own data. Falls back to a canned pointer to the "ยืม" command
  // if the AI call isn't configured or fails.
  const extraContext = awaitingQuantity
    ? `เพิ่งเลือกอุปกรณ์ "${pending!.asset.name}" ไว้ รอผู้ใช้พิมพ์จำนวนเป็นตัวเลขเฉยๆ ถ้าผู้ใช้ถามเกี่ยวกับเรื่องนี้ ให้เตือนว่าพิมพ์ตัวเลขจำนวนที่จะยืม`
    : pending
      ? `มีคำสั่งยืม "${pending.asset.name}" จำนวน ${pending.quantity} ค้างรอยืนยันอยู่ ถ้าผู้ใช้ถามเกี่ยวกับเรื่องนี้ ให้เตือนว่าพิมพ์ "ยืนยัน" หรือ "ยกเลิก"`
      : undefined;
  const aiReply = await answerFreeformQuestion(user, text, extraContext);

  await replyLineMessage(
    replyToken,
    aiReply ??
      (awaitingQuantity
        ? `จะยืม "${pending!.asset.name}" กี่${pending!.asset.unit}คะ? พิมพ์ตัวเลขได้เลยค่ะ`
        : pending
          ? `มีคำสั่งยืม "${pending.asset.name}" ค้างรอยืนยันอยู่นะคะ พิมพ์ "ยืนยัน" หรือ "ยกเลิก" ได้เลยค่ะ`
          : `พิมพ์ "ยืม <ชื่ออุปกรณ์> <จำนวน>" เพื่อยืมของได้เลยค่ะ เช่น "ยืม สว่าน 2"`)
  );
}

async function handleLinkAccount(lineUserId: string, text: string, replyToken: string) {
  const parts = text.trim().split(/\s+/);
  if (parts.length !== 2) {
    await replyLineMessage(
      replyToken,
      `สวัสดีค่ะ 👋 ก่อนใช้งานต้องผูกบัญชีก่อนนะคะ พิมพ์ username และ password ที่ใช้ล็อกอินเว็บ GMR AssetManager คั่นด้วยเว้นวรรค เช่น "gamer mypassword" ค่ะ`
    );
    return;
  }

  const [username, password] = parts;
  const user = await prisma.user.findUnique({ where: { username } });

  if (!user) {
    await replyLineMessage(replyToken, `ไม่พบชื่อผู้ใช้ "${username}" ในระบบค่ะ กรุณาตรวจสอบ username อีกครั้งนะคะ`);
    return;
  }

  const passwordMatches = await bcrypt.compare(password, user.password);
  if (!passwordMatches) {
    await replyLineMessage(replyToken, "รหัสผ่านไม่ถูกต้องค่ะ กรุณาลองใหม่อีกครั้งนะคะ");
    return;
  }

  if (user.lineUserId && user.lineUserId !== lineUserId) {
    await replyLineMessage(replyToken, "บัญชีนี้ถูกผูกกับ LINE อีกแอคเคาท์ไปแล้วค่ะ ถ้าต้องการเปลี่ยนกรุณาติดต่อแอดมินนะคะ");
    return;
  }

  await prisma.user.update({ where: { id: user.id }, data: { lineUserId } });

  await replyLineMessage(
    replyToken,
    `ผูกบัญชีกับ "${user.fullName || user.username}" เรียบร้อยแล้วค่ะ ✅\nพิมพ์ "ยืม <ชื่ออุปกรณ์> <จำนวน>" เพื่อยืมของได้เลยค่ะ เช่น "ยืม สว่าน 2"`
  );
}

async function handleBorrowCommand(lineUserId: string, assetQuery: string, quantity: number, replyToken: string) {
  if (!Number.isInteger(quantity) || quantity < 1) {
    await replyLineMessage(replyToken, "จำนวนไม่ถูกต้องค่ะ");
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
    await replyLineMessage(replyToken, `ไม่พบอุปกรณ์ชื่อ "${assetQuery}" ในระบบค่ะ ลองพิมพ์ชื่อให้ตรงกับในเว็บดูนะคะ`);
    return;
  }

  if (matches.length > 1) {
    // Quick Reply buttons, not a "retype it more precisely" prompt — the
    // hidden payload behind each pins the exact asset id, so tapping one is
    // unambiguous even when the short names themselves overlap (e.g.
    // "Relay" vs "Relay Socket") in a way retyping wouldn't resolve either.
    const quickReplies: QuickReplyOption[] = matches.map((a: Asset) => ({
      label: `${a.name} (${a.modelOrSize})`,
      text: `SELECT_ASSET:${a.id}:${quantity}`,
    }));
    await replyLineMessage(replyToken, `พบหลายรายการที่ตรงกับ "${assetQuery}" ค่ะ เลือกจากปุ่มด้านล่างได้เลยนะคะ 👇`, quickReplies);
    return;
  }

  await proposeBorrow(lineUserId, matches[0], quantity, replyToken);
}

async function handleSelectAsset(lineUserId: string, assetId: string, quantity: number, replyToken: string) {
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) {
    await replyLineMessage(replyToken, "ไม่พบอุปกรณ์นี้แล้วค่ะ อาจถูกลบไปจากระบบ ลองพิมพ์ค้นหาใหม่นะคะ");
    return;
  }
  // quantity 0 here means the original "ยืม <ชื่อ>" search never gave a
  // number in the first place — still need to ask for one.
  if (quantity < 1) {
    await askQuantity(lineUserId, asset, replyToken);
    return;
  }
  await proposeBorrow(lineUserId, asset, quantity, replyToken);
}

/** Same lookup as handleBorrowCommand, but for "ยืม <ชื่อ>" with no quantity
 *  given — asks for the quantity next instead of proposing a borrow. */
async function handleBorrowSearch(lineUserId: string, assetQuery: string, replyToken: string) {
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
    await replyLineMessage(replyToken, `ไม่พบอุปกรณ์ชื่อ "${assetQuery}" ในระบบค่ะ ลองพิมพ์ชื่อให้ตรงกับในเว็บดูนะคะ`);
    return;
  }

  if (matches.length > 1) {
    const quickReplies: QuickReplyOption[] = matches.map((a: Asset) => ({
      label: `${a.name} (${a.modelOrSize})`,
      text: `SELECT_ASSET:${a.id}:0`,
    }));
    await replyLineMessage(replyToken, `พบหลายรายการที่ตรงกับ "${assetQuery}" ค่ะ เลือกจากปุ่มด้านล่างได้เลยนะคะ 👇`, quickReplies);
    return;
  }

  await askQuantity(lineUserId, matches[0], replyToken);
}

async function askQuantity(lineUserId: string, asset: Asset, replyToken: string) {
  await prisma.linePendingBorrow.upsert({
    where: { lineUserId },
    create: { lineUserId, assetId: asset.id, quantity: AWAITING_QUANTITY },
    update: { assetId: asset.id, quantity: AWAITING_QUANTITY, createdAt: new Date() },
  });
  await replyLineMessage(replyToken, `จะยืม ${asset.name} (${asset.modelOrSize}) กี่${asset.unit}คะ? พิมพ์ตัวเลขได้เลยค่ะ`);
}

async function finalizeQuantity(pending: LinePendingBorrow & { asset: Asset }, quantity: number, replyToken: string) {
  if (quantity < 1) {
    await replyLineMessage(replyToken, "จำนวนต้องมากกว่า 0 นะคะ");
    return;
  }
  await proposeBorrow(pending.lineUserId, pending.asset, quantity, replyToken);
}

async function proposeBorrow(lineUserId: string, asset: Asset, quantity: number, replyToken: string) {
  if (asset.quantity < quantity) {
    await replyLineMessage(replyToken, `${asset.name} เหลือไม่พอค่ะ (คงเหลือ ${asset.quantity} ${asset.unit})`);
    return;
  }

  await prisma.linePendingBorrow.upsert({
    where: { lineUserId },
    create: { lineUserId, assetId: asset.id, quantity },
    update: { assetId: asset.id, quantity, createdAt: new Date() },
  });

  await replyLineMessage(
    replyToken,
    `ยืม ${asset.name} (${asset.modelOrSize}) จำนวน ${quantity} ${asset.unit} ใช่ไหมคะ?\nพิมพ์ "ยืนยัน" เพื่อยืนยัน หรือ "ยกเลิก" ค่ะ`
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
      if (!asset) throw new Error("ไม่พบอุปกรณ์นี้แล้วค่ะ อาจถูกลบไปจากระบบ");
      if (asset.quantity < pending.quantity) {
        throw new Error(`ของเหลือไม่พอแล้วค่ะ (คงเหลือ ${asset.quantity} ${asset.unit})`);
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
      `บันทึกการยืม ${result.asset.name} x${pending.quantity} ${result.asset.unit} เรียบร้อยแล้วค่ะ ✅ กำหนดคืนภายใน ${DEFAULT_LOAN_DAYS} วันนะคะ`
    );
    await notifyAdminsFYI(
      `📦 ${user.fullName || user.username} ยืม ${result.asset.name} (${result.asset.modelOrSize}) x${pending.quantity} ${result.asset.unit} (ผ่าน LINE)`
    );
  } catch (error) {
    logError("LINE confirmBorrow failed", error, { userId: user.id, assetId: pending.assetId });
    const message = error instanceof Error ? error.message : "ยืมของไม่สำเร็จค่ะ";
    await replyLineMessage(replyToken, message);
    await prisma.linePendingBorrow.delete({ where: { lineUserId: pending.lineUserId } }).catch(() => {});
  }
}

/** Step 1 of the OT-grant flow: lists everyone currently checked in at the
 *  office who doesn't already have OT open, as tap-to-pick buttons labeled
 *  with their nickname (falling back to full name/username) so the operator
 *  recognizes them without needing to type anything. */
async function handleOtGrantStart(replyToken: string) {
  const latestPerUser = await prisma.checkIn.findMany({
    orderBy: { createdAt: "desc" },
    distinct: ["userId"],
    include: { user: { select: { id: true, username: true, fullName: true, nickname: true } } },
  });

  const eligible = latestPerUser.filter(
    (c) => c.type === "IN" && c.location === "OFFICE" && !c.otGrantedHours
  );

  if (eligible.length === 0) {
    await replyLineMessage(replyToken, "ตอนนี้ไม่มีใครเช็คอินอยู่ที่ออฟฟิศที่ยังไม่ได้เปิด OT ค่ะ");
    return;
  }

  // LINE caps Quick Reply at 13 items.
  const options: QuickReplyOption[] = eligible.slice(0, 13).map((c) => ({
    label: c.user.nickname || c.user.fullName || c.user.username,
    text: `OT_PICK:${c.userId}`,
  }));

  await replyLineMessage(replyToken, "จะเปิด OT ให้ใครคะ?", options);
}

/** Step 2: the operator tapped a name — ask how many hours. */
async function handleOtPick(targetUserId: string, replyToken: string) {
  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) {
    await replyLineMessage(replyToken, "ไม่พบพนักงานคนนี้ค่ะ");
    return;
  }

  const name = target.nickname || target.fullName || target.username;
  const options: QuickReplyOption[] = OT_HOUR_OPTIONS.map((h) => ({
    label: `${h} ชม.`,
    text: `OT_GRANT:${targetUserId}:${h}`,
  }));

  await replyLineMessage(replyToken, `เปิด OT ให้ "${name}" กี่ชั่วโมงคะ?`, options);
}

/** Step 3: hours picked — doesn't grant anything yet, just remembers the
 *  choice (keyed by the operator's own lineUserId) and asks for a reason.
 *  The next message they send is picked up by the pendingOtGrant check in
 *  handleEvent, which calls finalizeOtGrant. */
async function handleOtHoursPicked(operatorLineUserId: string, targetUserId: string, hours: number, replyToken: string) {
  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) {
    await replyLineMessage(replyToken, "ไม่พบพนักงานคนนี้ค่ะ");
    return;
  }

  await prisma.linePendingOtGrant.upsert({
    where: { lineUserId: operatorLineUserId },
    create: { lineUserId: operatorLineUserId, targetUserId, hours },
    update: { targetUserId, hours, createdAt: new Date() },
  });

  const name = target.nickname || target.fullName || target.username;
  await replyLineMessage(replyToken, `เหตุผลที่เปิด OT ${hours} ชม. ให้ "${name}" คืออะไรคะ?`);
}

/** Step 4: reason given — actually grants it. Extends the deadline the
 *  reminder cron auto-checks-out at, logs it permanently (OtGrant, for the
 *  /ot page), adds a matching block to the employee's Work Schedule so it
 *  shows there too, and lets the employee know. */
async function finalizeOtGrant(
  operator: User,
  pending: { id: string; targetUserId: string; hours: number },
  reason: string,
  replyToken: string
) {
  const target = await prisma.user.findUnique({ where: { id: pending.targetUserId } });
  if (!target) {
    await prisma.linePendingOtGrant.delete({ where: { id: pending.id } });
    await replyLineMessage(replyToken, "ไม่พบพนักงานคนนี้ค่ะ");
    return;
  }

  const name = target.nickname || target.fullName || target.username;
  const openCheckIn = await getOpenCheckIn(pending.targetUserId);
  if (!openCheckIn || openCheckIn.location !== "OFFICE") {
    await prisma.linePendingOtGrant.delete({ where: { id: pending.id } });
    await replyLineMessage(replyToken, `${name} ไม่ได้เช็คอินอยู่ที่ออฟฟิศแล้วค่ะ (อาจเช็คเอาท์ไปแล้ว) เปิด OT ไม่สำเร็จ`);
    return;
  }

  const combinedNote = openCheckIn.note ? `${openCheckIn.note} | OT: ${reason}` : `OT: ${reason}`;
  const otStart = new Date(openCheckIn.createdAt.getTime() + EXPECTED_SPAN_MS);
  const otEnd = new Date(otStart.getTime() + pending.hours * 3_600_000);

  await prisma.$transaction([
    prisma.checkIn.update({
      where: { id: openCheckIn.id },
      data: { otGrantedHours: pending.hours, otGrantedById: operator.id, otGrantedAt: new Date(), note: combinedNote },
    }),
    prisma.otGrant.create({
      data: { userId: pending.targetUserId, hours: pending.hours, reason, grantedById: operator.id },
    }),
    prisma.workSchedule.create({
      data: {
        userId: pending.targetUserId,
        title: "ทำงานล่วงเวลา (OT)",
        startAt: otStart,
        endAt: otEnd,
        note: reason,
      },
    }),
    prisma.linePendingOtGrant.delete({ where: { id: pending.id } }),
  ]);

  revalidatePath("/attendance");
  revalidatePath("/work-schedule");
  revalidatePath("/ot");
  revalidatePath(`/users/${pending.targetUserId}`);

  await replyLineMessage(replyToken, `เปิด OT ให้ "${name}" ${pending.hours} ชั่วโมงเรียบร้อยค่ะ ✅`);

  if (target.lineUserId) {
    const operatorName = operator.nickname || operator.fullName || operator.username;
    await pushLineMessage(
      target.lineUserId,
      `${operatorName} เปิด OT ให้คุณวันนี้ ${pending.hours} ชั่วโมงค่ะ (${reason}) 💪`
    );
  }
}

async function handleApprovalDecision(
  admin: User,
  decision: "APPROVE" | "REJECT",
  kind: "LEAVE" | "BOOKING",
  id: string,
  replyToken: string
) {
  if (admin.role !== "ADMIN" && admin.role !== "OPERATOR") {
    await replyLineMessage(replyToken, "คุณไม่มีสิทธิ์ดำเนินการนี้ค่ะ");
    return;
  }

  const status = decision === "APPROVE" ? "APPROVED" : "REJECTED";
  const icon = decision === "APPROVE" ? "✅" : "❌";
  const actionLabel = decision === "APPROVE" ? "อนุมัติ" : "ปฏิเสธ";

  try {
    if (kind === "LEAVE") {
      // updateMany + count, not update, so a second admin tapping the same
      // button after someone else already decided gets told that plainly
      // instead of silently overwriting the first decision.
      const result = await prisma.leaveRequest.updateMany({
        where: { id, status: "PENDING" },
        data: { status, approvedById: admin.id, decidedAt: new Date() },
      });
      if (result.count === 0) {
        await replyLineMessage(replyToken, "คำขอนี้มีคนดำเนินการไปแล้วค่ะ");
        return;
      }

      const leaveRequest = await prisma.leaveRequest.findUnique({ where: { id } });
      if (!leaveRequest) return;

      await prisma.activityLog.create({
        data: {
          userId: admin.id,
          action: decision === "APPROVE" ? "APPROVE_LEAVE" : "REJECT_LEAVE",
          details: `${decision === "APPROVE" ? "Approved" : "Rejected"} leave request ${id} via LINE`,
        },
      });

      revalidatePath("/leave");
      await replyLineMessage(replyToken, `${icon} ${actionLabel}คำขอลาเรียบร้อยแล้วค่ะ`);
      await notifyUser(
        leaveRequest.userId,
        `${icon} ใบลา${leaveTypeLabel[leaveRequest.type] || leaveRequest.type} (${formatThaiDate(leaveRequest.startDate)} - ${formatThaiDate(leaveRequest.endDate)}) ${decision === "APPROVE" ? "ได้รับการอนุมัติแล้ว" : "ถูกปฏิเสธ"}ค่ะ`
      );
      return;
    }

    // BOOKING
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.booking.updateMany({
        where: { id, status: "PENDING" },
        data: { status, approvedById: admin.id, decidedAt: new Date() },
      });
      if (updated.count === 0) return null;

      const booking = await tx.booking.findUnique({ where: { id }, include: { vehicle: true } });
      if (!booking) return null;

      // Mirrors approveBooking()'s behavior: an approval auto-rejects any
      // other pending request for the same vehicle that overlaps it.
      if (decision === "APPROVE") {
        await tx.booking.updateMany({
          where: {
            vehicleId: booking.vehicleId,
            status: "PENDING",
            id: { not: id },
            startAt: { lt: booking.endAt },
            endAt: { gt: booking.startAt },
          },
          data: { status: "REJECTED", approvedById: admin.id, decidedAt: new Date() },
        });
      }

      return booking;
    });

    if (!result) {
      await replyLineMessage(replyToken, "คำขอนี้มีคนดำเนินการไปแล้วค่ะ");
      return;
    }

    await prisma.activityLog.create({
      data: {
        userId: admin.id,
        action: decision === "APPROVE" ? "APPROVE_BOOKING" : "REJECT_BOOKING",
        details: `${decision === "APPROVE" ? "Approved" : "Rejected"} booking for ${result.vehicle.name} via LINE`,
      },
    });

    revalidatePath("/carbook");
    await replyLineMessage(replyToken, `${icon} ${actionLabel}การจองรถเรียบร้อยแล้วค่ะ`);
    await notifyUser(
      result.userId,
      `${icon} การจองรถ ${result.vehicle.name} (${formatThaiDateTime(result.startAt)} - ${formatThaiDateTime(result.endAt)}) ${decision === "APPROVE" ? "ได้รับการอนุมัติแล้ว" : "ถูกปฏิเสธ"}ค่ะ`
    );
  } catch (error) {
    logError("LINE approval decision failed", error, { adminId: admin.id, decision, kind, id });
    await replyLineMessage(replyToken, "ดำเนินการไม่สำเร็จค่ะ ลองอีกครั้งหรือไปทำที่เว็บแทนนะคะ");
  }
}
