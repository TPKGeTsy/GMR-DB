import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rateLimit";
import { verifyLineSignature, replyLineMessage, pushLineMessage, type QuickReplyOption } from "@/lib/line";
import { answerFreeformQuestion, extractBorrowIntent } from "@/lib/lineAssistant";
import { notifyAdminsFYI, notifyUser, notifyOtManagers } from "@/lib/lineApprovals";
import { formatThaiDate, formatThaiDateTime, bangkokDateAt } from "@/lib/datetime";
import { isOtManagerRole } from "@/lib/roles";
import { grantOtToUser, getOpenCheckIn, realizeOutsideTripOtGrant } from "@/lib/otGrant";
import type { Asset, LinePendingBorrow, LinePendingOutsideTrip, User } from "@prisma/client";

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
const APPROVAL_COMMAND = /^(APPROVE|REJECT)_(LEAVE|BOOKING|OT_REQUEST):(.+)$/;
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
// The employee's own response to the OT push notification.
const OT_ACCEPT_COMMAND = /^OT_ACCEPT:(.+)$/;
const OT_DECLINE_COMMAND = /^OT_DECLINE:(.+)$/;
// Any employee (not just admin/operator — this is urgent-field-work
// self-service) can start an outside-work-trip registration with a natural
// sentence like "ต้องไปทำงานนอกสถานที่อ่า". Deliberately a plain keyword
// check, not an AI intent call — the "เปิดOT" trigger bug earlier showed
// what happens when a workflow-critical trigger relies on something less
// deterministic and falls through to the AI Q&A fallback instead.
function looksLikeOutsideTripRequest(text: string): boolean {
  return /นอกสถานที่/.test(text) && /(ไป|ทำงาน|ออก)/.test(text);
}
// "ไป Sharp 3 คน" — location text (anything, incl. spaces) then a headcount
// ending in "คน". The leading "ไป" is optional (someone might just type
// "Sharp 3 คน").
const OUTSIDE_TRIP_LOCATION_COUNT = /^(?:ไป\s*)?(.+?)\s*(\d+)\s*คน\s*$/;
const OUTTRIP_TOGGLE_COMMAND = /^OUTTRIP_TOGGLE:(.+)$/;
const OUTTRIP_CONFIRM_COMMAND = "OUTTRIP_CONFIRM";
// The two buttons on the early-check-in prompt (see recordCheckIn in
// app/actions/checkin.ts, which sends them).
const EARLY_HAS_WORK_COMMAND = /^EARLY_HAS_WORK:(.+)$/;
const EARLY_JUST_EARLY_COMMAND = /^EARLY_JUST_EARLY:(.+)$/;
// Self-serve OT request — "ขอ OT <ชั่วโมง> <เหตุผล>", e.g. "ขอ OT 2 มีงานด่วนต้องทำต่อ".
// Case-insensitive on "OT" so "ขอot"/"ขอ ot" both match.
const OT_REQUEST_COMMAND = /^ขอ\s*ot\s+(\d+(?:\.\d+)?)\s+(.+)$/i;

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

  // The very next message from an employee after tapping "ไม่รับ OT" is
  // taken as their decline reason (unless it's a cancel word, which just
  // leaves the grant PENDING instead of declining it).
  const declinePendingGrant = await prisma.otGrant.findFirst({
    where: { userId: user.id, status: "DECLINE_PENDING" },
    orderBy: { createdAt: "desc" },
  });
  if (declinePendingGrant) {
    if (CANCEL_WORDS.has(normalized)) {
      await prisma.otGrant.update({ where: { id: declinePendingGrant.id }, data: { status: "PENDING" } });
      await replyLineMessage(replyToken, "โอเคค่ะ ไม่ยกเลิกก็ได้ค่ะ");
      return;
    }
    await handleOtDeclineConfirm(user, declinePendingGrant, text.slice(0, 300), replyToken);
    return;
  }

  // The one in-progress "registering an outside-work trip" flow, keyed by
  // the requester's own lineUserId. AWAITING_LOCATION_COUNT takes the next
  // message as free-text location+headcount; AWAITING_MEMBERS is entirely
  // button-driven (OUTTRIP_TOGGLE/OUTTRIP_CONFIRM below), so a stray text
  // message during that step is just redirected back to the buttons.
  const pendingOutsideTrip = await prisma.linePendingOutsideTrip.findUnique({ where: { lineUserId } });
  if (pendingOutsideTrip) {
    const isExpired = Date.now() - pendingOutsideTrip.createdAt.getTime() > PENDING_EXPIRY_MS;
    if (isExpired) {
      await prisma.linePendingOutsideTrip.delete({ where: { id: pendingOutsideTrip.id } });
    } else if (CANCEL_WORDS.has(normalized)) {
      await prisma.linePendingOutsideTrip.delete({ where: { id: pendingOutsideTrip.id } });
      await replyLineMessage(replyToken, "ยกเลิกการลงทะเบียนไปทำงานนอกสถานที่แล้วค่ะ");
      return;
    } else if (pendingOutsideTrip.step === "AWAITING_LOCATION_COUNT") {
      await handleOutsideTripLocationCount(pendingOutsideTrip, text, replyToken);
      return;
    } else if (!OUTTRIP_TOGGLE_COMMAND.test(text) && text !== OUTTRIP_CONFIRM_COMMAND) {
      // AWAITING_MEMBERS is button-driven — a toggle/confirm tap falls
      // through to its own handler further down; anything else (stray free
      // text) gets redirected back to the buttons instead of being treated
      // as a new command.
      await replyLineMessage(replyToken, `กดปุ่มเลือกสมาชิกด้านบนได้เลยค่ะ หรือพิมพ์ "ยกเลิก" เพื่อยกเลิกนะคะ`);
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
    if (openCheckIn.tripId) {
      await realizeOutsideTripOtGrant(openCheckIn.id, user.id);
      revalidatePath("/ot");
    }
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
    await handleApprovalDecision(
      user,
      decision as "APPROVE" | "REJECT",
      kind as "LEAVE" | "BOOKING" | "OT_REQUEST",
      id,
      replyToken
    );
    return;
  }

  const selectMatch = text.match(SELECT_ASSET_COMMAND);
  if (selectMatch) {
    await handleSelectAsset(lineUserId, selectMatch[1], Number(selectMatch[2]), replyToken);
    return;
  }

  const isOtManager = isOtManagerRole(user.role);

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

  // Not role-gated — any employee can register an outside-work trip.
  if (looksLikeOutsideTripRequest(text)) {
    await handleOutsideTripStart(lineUserId, replyToken);
    return;
  }

  const outTripToggleMatch = text.match(OUTTRIP_TOGGLE_COMMAND);
  if (outTripToggleMatch) {
    await handleOutsideTripToggle(lineUserId, outTripToggleMatch[1], replyToken);
    return;
  }

  if (text === OUTTRIP_CONFIRM_COMMAND) {
    await handleOutsideTripConfirm(lineUserId, user, replyToken);
    return;
  }

  const earlyHasWorkMatch = text.match(EARLY_HAS_WORK_COMMAND);
  if (earlyHasWorkMatch) {
    await handleEarlyHasWork(user, earlyHasWorkMatch[1], replyToken);
    return;
  }

  const earlyJustEarlyMatch = text.match(EARLY_JUST_EARLY_COMMAND);
  if (earlyJustEarlyMatch) {
    await handleEarlyJustEarly(user, earlyJustEarlyMatch[1], replyToken);
    return;
  }

  const otRequestMatch = text.match(OT_REQUEST_COMMAND);
  if (otRequestMatch) {
    await handleOtSelfRequest(user, Number(otRequestMatch[1]), otRequestMatch[2].trim(), replyToken);
    return;
  }

  const otGrantMatch = text.match(OT_GRANT_COMMAND);
  if (otGrantMatch) {
    if (!isOtManager) return;
    await handleOtHoursPicked(lineUserId, otGrantMatch[1], Number(otGrantMatch[2]), replyToken);
    return;
  }

  const otAcceptMatch = text.match(OT_ACCEPT_COMMAND);
  if (otAcceptMatch) {
    await handleOtAccept(user, otAcceptMatch[1], replyToken);
    return;
  }

  const otDeclineMatch = text.match(OT_DECLINE_COMMAND);
  if (otDeclineMatch) {
    await handleOtDeclineStart(user, otDeclineMatch[1], replyToken);
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

/** Step 4: reason given — actually grants it, then lets the employee know. */
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

  const grant = await grantOtToUser({
    userId: pending.targetUserId,
    hours: pending.hours,
    reason,
    grantedById: operator.id,
    openCheckIn,
    cleanupPendingOtGrantId: pending.id,
  });

  revalidatePath("/attendance");
  revalidatePath("/work-schedule");
  revalidatePath("/ot");
  revalidatePath(`/users/${pending.targetUserId}`);

  await replyLineMessage(replyToken, `เปิด OT ให้ "${name}" ${pending.hours} ชั่วโมงเรียบร้อยค่ะ ✅`);

  if (target.lineUserId) {
    const operatorName = operator.nickname || operator.fullName || operator.username;
    await pushLineMessage(
      target.lineUserId,
      `${operatorName} เปิด OT ให้คุณวันนี้ ${pending.hours} ชั่วโมงค่ะ (${reason}) รับไหมคะ? 💪`,
      [
        { label: "รับ OT", text: `OT_ACCEPT:${grant.id}` },
        { label: "ไม่รับ OT", text: `OT_DECLINE:${grant.id}` },
      ]
    );
  }
}

/** Employee tapped "รับ OT" — just an acknowledgment, the grant was already
 *  in effect. Lets the operator know it was accepted. */
async function handleOtAccept(employee: User, grantId: string, replyToken: string) {
  const grant = await prisma.otGrant.findUnique({ where: { id: grantId }, include: { grantedBy: true } });
  if (!grant || grant.userId !== employee.id) {
    await replyLineMessage(replyToken, "ไม่พบรายการเปิด OT นี้ค่ะ");
    return;
  }
  if (grant.status !== "PENDING") {
    await replyLineMessage(replyToken, "รายการนี้ตอบไปแล้วค่ะ");
    return;
  }

  await prisma.otGrant.update({ where: { id: grant.id }, data: { status: "ACCEPTED", respondedAt: new Date() } });
  revalidatePath("/ot");

  await replyLineMessage(replyToken, "รับทราบค่ะ สู้ๆ นะคะ 💪");

  if (grant.grantedBy.lineUserId) {
    const name = employee.nickname || employee.fullName || employee.username;
    await pushLineMessage(grant.grantedBy.lineUserId, `${name} รับ OT ${grant.hours} ชม. ที่เปิดให้แล้วค่ะ ✅`);
  }
}

/** Employee tapped "ไม่รับ OT" — ask why before actually declining (see the
 *  declinePendingGrant check in handleEvent, which calls handleOtDeclineConfirm
 *  with whatever they type next). */
async function handleOtDeclineStart(employee: User, grantId: string, replyToken: string) {
  const grant = await prisma.otGrant.findUnique({ where: { id: grantId } });
  if (!grant || grant.userId !== employee.id) {
    await replyLineMessage(replyToken, "ไม่พบรายการเปิด OT นี้ค่ะ");
    return;
  }
  if (grant.status !== "PENDING") {
    await replyLineMessage(replyToken, "รายการนี้ตอบไปแล้วค่ะ");
    return;
  }

  await prisma.otGrant.update({ where: { id: grant.id }, data: { status: "DECLINE_PENDING" } });
  await replyLineMessage(replyToken, "รบกวนบอกเหตุผลที่ไม่รับ OT หน่อยค่ะ");
}

/** Reason given — declines for real. Undoes exactly the CheckIn/WorkSchedule
 *  rows this specific grant created (only if they still look like this grant
 *  and not something newer), and tells the operator why. */
async function handleOtDeclineConfirm(
  employee: User,
  grant: { id: string; hours: number; checkInId: string | null; workScheduleId: string | null; grantedById: string },
  declineReason: string,
  replyToken: string
) {
  await prisma.$transaction(async (tx) => {
    await tx.otGrant.update({
      where: { id: grant.id },
      data: { status: "DECLINED", declineReason, respondedAt: new Date() },
    });

    if (grant.checkInId) {
      const checkIn = await tx.checkIn.findUnique({ where: { id: grant.checkInId } });
      // Only revert if it's still open and still credits *this* grant —
      // if it's since been checked out, or a newer grant replaced this
      // one's hours, leave it alone rather than clobber something else.
      if (checkIn && checkIn.type === "IN" && checkIn.otGrantedById === grant.grantedById && checkIn.otGrantedHours === grant.hours) {
        await tx.checkIn.update({
          where: { id: checkIn.id },
          data: { otGrantedHours: null, otGrantedById: null, otGrantedAt: null },
        });
      }
    }

    if (grant.workScheduleId) {
      await tx.workSchedule.deleteMany({ where: { id: grant.workScheduleId } });
    }
  });

  revalidatePath("/attendance");
  revalidatePath("/work-schedule");
  revalidatePath("/ot");

  await replyLineMessage(replyToken, "บันทึกแล้วค่ะ ไม่เป็นไรนะคะ 🙏");

  const operator = await prisma.user.findUnique({ where: { id: grant.grantedById } });
  if (operator?.lineUserId) {
    const name = employee.nickname || employee.fullName || employee.username;
    await pushLineMessage(
      operator.lineUserId,
      `${name} ไม่รับ OT ${grant.hours} ชม. ที่เปิดให้ค่ะ\nเหตุผล: ${declineReason}`
    );
  }
}

/** Step 1 of the outside-work-trip flow: any employee sends a free-text
 *  message like "ต้องไปทำงานนอกสถานที่อ่า" — ask where and how many. */
async function handleOutsideTripStart(lineUserId: string, replyToken: string) {
  await prisma.linePendingOutsideTrip.upsert({
    where: { lineUserId },
    create: { lineUserId, step: "AWAITING_LOCATION_COUNT", selectedUserIds: [] },
    update: { step: "AWAITING_LOCATION_COUNT", location: null, headcount: null, selectedUserIds: [], createdAt: new Date() },
  });
  await replyLineMessage(replyToken, `โอเคค่ะ ไปที่ไหน และไปกี่คนคะ? (เช่น "ไป Sharp 3 คน")`);
}

/** Step 2: parses "<สถานที่> <จำนวน> คน" — on success moves to
 *  AWAITING_MEMBERS and shows the team picker; on failure re-asks without
 *  advancing the step. */
async function handleOutsideTripLocationCount(
  pending: LinePendingOutsideTrip,
  text: string,
  replyToken: string
) {
  const match = text.trim().match(OUTSIDE_TRIP_LOCATION_COUNT);
  const location = match?.[1]?.trim();
  const headcount = match ? Number(match[2]) : NaN;

  if (!match || !location || !Number.isInteger(headcount) || headcount < 1) {
    await replyLineMessage(replyToken, `รบกวนระบุสถานที่และจำนวนคนด้วยนะคะ เช่น "ไป Sharp 3 คน"`);
    return;
  }

  const updated = await prisma.linePendingOutsideTrip.update({
    where: { id: pending.id },
    data: { step: "AWAITING_MEMBERS", location, headcount, selectedUserIds: [] },
  });

  await replyOutsideTripPicker(updated, replyToken);
}

/** Builds the team-picker Quick Reply for the current selection state —
 *  candidates are everyone currently checked in at the office (the same
 *  eligibility query as handleOtGrantStart) plus anyone already selected,
 *  so a tap never makes a name disappear. Each name toggles on tap (✅
 *  prefix when selected); a "ยืนยันทีม (n/headcount)" button is always
 *  last. This is the closest LINE-native approximation of ticking several
 *  boxes at once — Quick Reply has no true multi-select, so each tap
 *  re-sends the same list with the updated state instead of navigating
 *  anywhere, keeping the whole thing in one chat flow. */
async function buildOutsideTripPickerMessage(pending: {
  location: string | null;
  headcount: number | null;
  selectedUserIds: string[];
}): Promise<{ text: string; options: QuickReplyOption[] }> {
  const latestPerUser = await prisma.checkIn.findMany({
    orderBy: { createdAt: "desc" },
    distinct: ["userId"],
    include: { user: { select: { id: true, username: true, fullName: true, nickname: true } } },
  });
  const eligible = latestPerUser.filter((c) => c.type === "IN" && c.location === "OFFICE");

  const candidates = eligible.map((c) => ({
    id: c.userId,
    name: c.user.nickname || c.user.fullName || c.user.username,
  }));
  const missingSelected = pending.selectedUserIds.filter((id) => !candidates.some((c) => c.id === id));
  if (missingSelected.length > 0) {
    const users = await prisma.user.findMany({ where: { id: { in: missingSelected } } });
    for (const u of users) candidates.push({ id: u.id, name: u.nickname || u.fullName || u.username });
  }

  // LINE caps Quick Reply at 13 items — leave one slot for the confirm button.
  const options: QuickReplyOption[] = candidates.slice(0, 12).map((c) => ({
    label: `${pending.selectedUserIds.includes(c.id) ? "✅ " : ""}${c.name}`,
    text: `OUTTRIP_TOGGLE:${c.id}`,
  }));
  options.push({
    label: `ยืนยันทีม (${pending.selectedUserIds.length}/${pending.headcount ?? "?"})`,
    text: OUTTRIP_CONFIRM_COMMAND,
  });

  const text = `ไป "${pending.location}" ${pending.headcount} คน — แตะชื่อเพื่อเลือก/ยกเลิกสมาชิก แล้วกด "ยืนยันทีม" ค่ะ 👇`;
  return { text, options };
}

async function replyOutsideTripPicker(
  pending: { location: string | null; headcount: number | null; selectedUserIds: string[] },
  replyToken: string
) {
  const { text, options } = await buildOutsideTripPickerMessage(pending);
  await replyLineMessage(replyToken, text, options);
}

/** A tap on one of the team-picker names — adds/removes it from the
 *  selection and resends the same picker with the updated state. */
async function handleOutsideTripToggle(lineUserId: string, targetUserId: string, replyToken: string) {
  const pending = await prisma.linePendingOutsideTrip.findUnique({ where: { lineUserId } });
  if (!pending || pending.step !== "AWAITING_MEMBERS") {
    await replyLineMessage(replyToken, `ไม่พบรายการที่กำลังลงทะเบียนอยู่ค่ะ ลองเริ่มใหม่โดยพิมพ์ว่าจะไปทำงานนอกสถานที่นะคะ`);
    return;
  }

  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) {
    await replyLineMessage(replyToken, "ไม่พบพนักงานคนนี้ค่ะ");
    return;
  }

  const selectedUserIds = pending.selectedUserIds.includes(targetUserId)
    ? pending.selectedUserIds.filter((id) => id !== targetUserId)
    : [...pending.selectedUserIds, targetUserId];

  const updated = await prisma.linePendingOutsideTrip.update({
    where: { id: pending.id },
    data: { selectedUserIds, createdAt: new Date() },
  });

  await replyOutsideTripPicker(updated, replyToken);
}

/** "ยืนยันทีม" tapped — creates the trip, closes each selected member's
 *  open session (if any) and opens a fresh OUTSIDE one tagged with the
 *  trip, then notifies everyone. Any member already on an open IN session
 *  (OFFICE or a previous OUTSIDE trip) gets auto-checked-out of it first —
 *  a person can only ever have one open session. */
async function handleOutsideTripConfirm(lineUserId: string, requester: User, replyToken: string) {
  const pending = await prisma.linePendingOutsideTrip.findUnique({ where: { lineUserId } });
  if (!pending || pending.step !== "AWAITING_MEMBERS") {
    await replyLineMessage(replyToken, "ไม่พบรายการที่กำลังลงทะเบียนอยู่ค่ะ");
    return;
  }
  if (pending.selectedUserIds.length === 0) {
    await replyLineMessage(replyToken, "ยังไม่ได้เลือกสมาชิกเลยค่ะ แตะชื่อเพื่อเลือกก่อนนะคะ");
    return;
  }

  const location = pending.location || "-";
  const members = await prisma.user.findMany({ where: { id: { in: pending.selectedUserIds } } });

  await prisma.$transaction(async (tx) => {
    const created = await tx.outsideWorkTrip.create({ data: { location, createdById: requester.id } });

    for (const member of members) {
      const latest = await tx.checkIn.findFirst({ where: { userId: member.id }, orderBy: { createdAt: "desc" } });
      if (latest?.type === "IN") {
        await tx.checkIn.create({
          data: {
            userId: member.id,
            type: "OUT",
            location: latest.location,
            confidence: null,
            note: `เปลี่ยนเป็นทำงานนอกสถานที่ (${location})`,
          },
        });
      }
      const checkIn = await tx.checkIn.create({
        data: { userId: member.id, type: "IN", location: "OUTSIDE", confidence: null, note: location, tripId: created.id },
      });
      await tx.outsideWorkTripMember.create({
        data: { tripId: created.id, userId: member.id, checkInId: checkIn.id },
      });
    }

    await tx.linePendingOutsideTrip.delete({ where: { id: pending.id } });
  });

  revalidatePath("/attendance");
  revalidatePath("/work-schedule");

  const names = members.map((m) => m.nickname || m.fullName || m.username).join(", ");
  await replyLineMessage(replyToken, `บันทึกทีมไปทำงานนอกสถานที่ที่ "${location}" เรียบร้อยค่ะ ✅\nสมาชิก: ${names}`);

  const requesterName = requester.nickname || requester.fullName || requester.username;
  await Promise.all(
    members
      .filter((m) => m.id !== requester.id && m.lineUserId)
      .map((m) => pushLineMessage(m.lineUserId!, `${requesterName} บันทึกให้คุณไปทำงานนอกสถานที่ที่ "${location}" ค่ะ 📍`))
  );
}

/** Early check-in, "มีงาน" tapped — audit-only marker, no math change (see
 *  CheckIn.earlyOtConfirmedAt's doc comment in schema.prisma). */
async function handleEarlyHasWork(employee: User, checkInId: string, replyToken: string) {
  const checkIn = await prisma.checkIn.findUnique({ where: { id: checkInId } });
  if (!checkIn || checkIn.userId !== employee.id) {
    await replyLineMessage(replyToken, "ไม่พบรายการเช็คอินนี้ค่ะ");
    return;
  }
  await prisma.checkIn.update({ where: { id: checkIn.id }, data: { earlyOtConfirmedAt: new Date() } });
  await replyLineMessage(replyToken, "รับทราบค่ะ สู้ๆ นะคะ 💪");
}

/** Early check-in, "แค่มาก่อน" tapped — the early time before 9:00 shouldn't
 *  count as worked/OT time, so this sets otStartOverride to 09:00 Bangkok
 *  on the check-in's own day; buildDailySummary uses it for hour math from
 *  here on (see lib/attendance.ts), while the true check-in time stays what
 *  displays everywhere. */
async function handleEarlyJustEarly(employee: User, checkInId: string, replyToken: string) {
  const checkIn = await prisma.checkIn.findUnique({ where: { id: checkInId } });
  if (!checkIn || checkIn.userId !== employee.id) {
    await replyLineMessage(replyToken, "ไม่พบรายการเช็คอินนี้ค่ะ");
    return;
  }
  const otStartOverride = bangkokDateAt(checkIn.createdAt, 9, 0);
  await prisma.checkIn.update({ where: { id: checkIn.id }, data: { otStartOverride } });
  revalidatePath("/attendance");
  revalidatePath(`/users/${employee.id}`);
  await replyLineMessage(replyToken, "โอเคค่ะ พักผ่อนไปก่อนนะคะ เวลางานจะเริ่มนับตั้งแต่ 9 โมงค่ะ ☕");
}

/** Self-serve OT request — "ขอ OT <ชั่วโมง> <เหตุผล>". Requires being
 *  currently checked in at the office (OT only makes sense while working);
 *  creates a PENDING OtApprovalRequest and notifies OT managers, same
 *  approve/reject flow (APPROVAL_COMMAND, kind OT_REQUEST) as everywhere
 *  else an OtApprovalRequest is decided. */
async function handleOtSelfRequest(employee: User, hours: number, reason: string, replyToken: string) {
  if (!Number.isFinite(hours) || hours <= 0 || hours > 12) {
    await replyLineMessage(replyToken, `จำนวนชั่วโมงไม่ถูกต้องค่ะ ลองพิมพ์ใหม่ เช่น "ขอ OT 2 ${reason || "มีงานด่วน"}"`);
    return;
  }

  const openCheckIn = await getOpenCheckIn(employee.id);
  if (!openCheckIn || openCheckIn.location !== "OFFICE") {
    await replyLineMessage(replyToken, "คุณต้องเช็คอินอยู่ที่ออฟฟิศก่อนถึงจะขอ OT ได้ค่ะ");
    return;
  }

  const request = await prisma.otApprovalRequest.create({
    data: { userId: employee.id, source: "SELF_REQUEST", requestedHours: hours, reason: reason.slice(0, 300) },
  });

  revalidatePath("/ot");
  await replyLineMessage(replyToken, `ส่งคำขอ OT ${hours} ชม. (${reason}) ให้ผู้ดูแลอนุมัติแล้วค่ะ รอสักครู่นะคะ 🙏`);

  const name = employee.nickname || employee.fullName || employee.username;
  await notifyOtManagers(request.id, `🙋 ${name} ขอ OT ${hours} ชม. (${reason}) ขออนุมัติค่ะ`);
}

async function handleApprovalDecision(
  admin: User,
  decision: "APPROVE" | "REJECT",
  kind: "LEAVE" | "BOOKING" | "OT_REQUEST",
  id: string,
  replyToken: string
) {
  // OT requests are also SENIOR's to decide; leave/booking stay ADMIN/OPERATOR-only.
  const allowed = kind === "OT_REQUEST" ? isOtManagerRole(admin.role) : admin.role === "ADMIN" || admin.role === "OPERATOR";
  if (!allowed) {
    await replyLineMessage(replyToken, "คุณไม่มีสิทธิ์ดำเนินการนี้ค่ะ");
    return;
  }

  const status = decision === "APPROVE" ? "APPROVED" : "REJECTED";
  const icon = decision === "APPROVE" ? "✅" : "❌";
  const actionLabel = decision === "APPROVE" ? "อนุมัติ" : "ปฏิเสธ";

  try {
    if (kind === "OT_REQUEST") {
      const result = await prisma.otApprovalRequest.updateMany({
        where: { id, status: "PENDING" },
        data: { status, decidedById: admin.id, decidedAt: new Date() },
      });
      if (result.count === 0) {
        await replyLineMessage(replyToken, "คำขอนี้มีคนดำเนินการไปแล้วค่ะ");
        return;
      }

      const request = await prisma.otApprovalRequest.findUnique({ where: { id } });
      if (!request) return;

      const target = await prisma.user.findUnique({ where: { id: request.userId } });
      const targetName = target ? target.nickname || target.fullName || target.username : "พนักงาน";

      // SELF_REQUEST hours are known upfront, so approval can grant right
      // away (only if they're still checked in at the office). OUTSIDE_AUTO
      // requests are open-ended — approval here just clears them to accrue
      // OT; the actual OtGrant is realized once they check out for real.
      if (decision === "APPROVE" && request.source === "SELF_REQUEST" && request.requestedHours) {
        const openCheckIn = await getOpenCheckIn(request.userId);
        if (openCheckIn && openCheckIn.location === "OFFICE") {
          await grantOtToUser({
            userId: request.userId,
            hours: request.requestedHours,
            reason: request.reason || "คำขอ OT จากพนักงาน",
            grantedById: admin.id,
            openCheckIn,
          });
        }
      }

      await prisma.activityLog.create({
        data: {
          userId: admin.id,
          action: decision === "APPROVE" ? "APPROVE_OT_REQUEST" : "REJECT_OT_REQUEST",
          details: `${decision === "APPROVE" ? "Approved" : "Rejected"} OT request ${id} via LINE`,
        },
      });

      revalidatePath("/ot");
      revalidatePath("/attendance");
      revalidatePath("/work-schedule");
      await replyLineMessage(replyToken, `${icon} ${actionLabel}คำขอ OT ของ ${targetName} เรียบร้อยแล้วค่ะ`);
      if (target) {
        await notifyUser(
          target.id,
          `${icon} คำขอ OT ของคุณ${request.requestedHours ? ` (${request.requestedHours} ชม.)` : ""} ${decision === "APPROVE" ? "ได้รับการอนุมัติแล้ว" : "ถูกปฏิเสธ"}ค่ะ`
        );
      }
      return;
    }

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
