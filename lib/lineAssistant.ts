import prisma from "./prisma";
import { logError } from "./logger";
import { buildDailySummary } from "./attendance";
import { formatThaiDate, formatThaiDateTime } from "./datetime";
import type { User } from "@prisma/client";

const GROQ_MODEL = "qwen/qwen3.8-27b";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

/** Shared Groq chat-completion call. Returns the raw text reply (never
 *  throws) or null if the key is missing, the request fails, or the model
 *  returned nothing usable — callers fall back to a canned response. */
async function callGroq(
  system: string,
  userText: string,
  opts: { maxTokens: number; jsonMode?: boolean }
): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    logError("LINE assistant skipped", new Error("GROQ_API_KEY is not set"));
    return null;
  }

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userText },
      ],
      max_tokens: opts.maxTokens,
      temperature: 0.3,
      ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logError("Groq call failed", new Error(`HTTP ${res.status}`), { body });
    return null;
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  return typeof text === "string" && text.trim() ? text.trim() : null;
}

const leaveTypeLabel: Record<string, string> = {
  SICK: "ลาป่วย",
  PERSONAL: "ลากิจ",
  VACATION: "ลาพักร้อน",
};

const leaveStatusLabel: Record<string, string> = {
  PENDING: "รออนุมัติ",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ถูกปฏิเสธ",
  CANCELLED: "ยกเลิกแล้ว",
};

const bookingStatusLabel: Record<string, string> = {
  PENDING: "รออนุมัติ",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ถูกปฏิเสธ",
  CANCELLED: "ยกเลิกแล้ว",
};

/** Gathers a compact, this-user-only snapshot of attendance/loans/leave/car
 *  bookings to hand the model as context — it only ever sees the asking
 *  user's own data, never anyone else's. */
async function buildUserContext(user: User): Promise<string> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [monthCheckIns, activeLoans, recentLeaves, recentBookings] = await Promise.all([
    prisma.checkIn.findMany({
      where: { userId: user.id, createdAt: { gte: startOfMonth } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.loan.findMany({
      where: { userId: user.id, returnedAt: null },
      include: { asset: { select: { name: true, modelOrSize: true, unit: true } } },
      orderBy: { borrowedAt: "desc" },
    }),
    prisma.leaveRequest.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.booking.findMany({
      where: { userId: user.id },
      include: { vehicle: { select: { name: true, licensePlate: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const dailyRows = buildDailySummary(monthCheckIns);
  const daysWorked = dailyRows.length;
  const totalHours = dailyRows.reduce((sum, r) => sum + r.totalHours, 0);
  const otHours = dailyRows.reduce((sum, r) => sum + r.otHours, 0);
  const todayRow = dailyRows.find((r) => r.stillWorking);

  const loanLines = activeLoans.length
    ? activeLoans
        .map((l) => `- ${l.asset.name} (${l.asset.modelOrSize}) x${l.quantity} ยืมเมื่อ ${formatThaiDate(l.borrowedAt)}`)
        .join("\n")
    : "- ไม่มีของที่กำลังยืมอยู่";

  const leaveLines = recentLeaves.length
    ? recentLeaves
        .map(
          (l) =>
            `- ${leaveTypeLabel[l.type] || l.type} ${formatThaiDate(l.startDate)}-${formatThaiDate(l.endDate)} (${leaveStatusLabel[l.status] || l.status})`
        )
        .join("\n")
    : "- ยังไม่เคยยื่นใบลา";

  const bookingLines = recentBookings.length
    ? recentBookings
        .map(
          (b) =>
            `- ${b.vehicle.name} (${b.vehicle.licensePlate}) ${formatThaiDateTime(b.startAt)}-${formatThaiDateTime(b.endAt)} (${bookingStatusLabel[b.status] || b.status})`
        )
        .join("\n")
    : "- ยังไม่เคยจองรถ";

  return `ข้อมูลของ ${user.fullName || user.username} (วันนี้ ${formatThaiDate(now)}):

เดือนนี้ทำงานมาแล้ว ${daysWorked} วัน รวม ${totalHours.toFixed(1)} ชั่วโมง (เป็น OT ${otHours.toFixed(1)} ชม.)
สถานะวันนี้: ${todayRow ? "เช็คอินแล้ว ยังทำงานอยู่" : "ยังไม่ได้เช็คอิน หรือเช็คเอาท์ไปแล้ว"}

ของที่กำลังยืมอยู่:
${loanLines}

ใบลาล่าสุด:
${leaveLines}

การจองรถล่าสุด:
${bookingLines}`;
}

const SYSTEM_PROMPT = `คุณคือผู้ช่วยหญิงของระบบ GMR AssetManager (ระบบจัดการคลังอุปกรณ์/เข้างาน/ยืมของของบริษัท) พูดจาเป็นกันเอง สุภาพ ใช้คำลงท้าย "ค่ะ"/"นะคะ" ตอบสั้นกระชับ ไม่เกิน 3-4 ประโยค

กติกาสำคัญ:
- ตอบจากข้อมูลของผู้ใช้ที่ให้มาเท่านั้น ห้ามเดาหรือกุข้อมูลขึ้นเอง ถ้าไม่มีข้อมูลให้บอกตรงๆ ว่าไม่มีข้อมูลส่วนนี้
- ห้ามให้ข้อมูลของพนักงานคนอื่นเด็ดขาด (คุณไม่มีข้อมูลคนอื่นอยู่แล้ว)
- ถ้าผู้ใช้อยากยืมของ ให้บอกว่าพิมพ์ "ยืม <ชื่ออุปกรณ์> <จำนวน>" เช่น "ยืม สว่าน 2" ได้เลย (คุณตอบคำถามแนะนำได้ แต่การยืมจริงต้องผ่านคำสั่งนั้นเท่านั้น ไม่ใช่ผ่านคุณ)
- ถ้าผู้ใช้อยากลางาน หรือจองรถ ให้แนะนำให้ไปทำที่เว็บ GMR AssetManager (คุณทำธุรกรรมพวกนี้ให้ไม่ได้)
- อย่าแนะนำสิ่งที่เกี่ยวกับความปลอดภัย บัญชี หรือรหัสผ่านของคนอื่น`;

/** Answers a free-form question using the user's own data as context.
 *  Returns null (never throws) if the API key is missing or the call fails
 *  — callers should fall back to a canned message in that case. */
export async function answerFreeformQuestion(
  user: User,
  question: string,
  extraContext?: string
): Promise<string | null> {
  try {
    const context = await buildUserContext(user);
    const system = extraContext ? `${SYSTEM_PROMPT}\n\n${context}\n\n${extraContext}` : `${SYSTEM_PROMPT}\n\n${context}`;
    return await callGroq(system, question.slice(0, 1000), { maxTokens: 400 });
  } catch (error) {
    logError("LINE assistant request failed", error, { userId: user.id });
    return null;
  }
}

export interface BorrowIntent {
  isBorrowRequest: boolean;
  item: string | null;
  quantity: number | null;
}

/** Reads a message that didn't match the strict "ยืม <ชื่อ> <จำนวน>" command
 *  and asks the model whether it's a borrow request in looser natural
 *  language anyway (e.g. "ขอยืมสว่านหน่อยครับ 2 ตัว", or just "สว่าน 2 ตัว"
 *  as a reply to "ยืมอะไรดีคะ?") — extracting an item name/quantity only,
 *  never taking or proposing any action itself. The caller still has to run
 *  the extracted item through the normal DB search + explicit "ยืนยัน"
 *  confirmation before anything is actually borrowed, exactly as if the
 *  user had typed the strict command — this just widens what counts as
 *  typing it. Returns null (never throws) on any failure, so the caller can
 *  fall back to treating the message as a plain question. */
export async function extractBorrowIntent(text: string, awaitingContext?: string): Promise<BorrowIntent | null> {
  if (!process.env.GROQ_API_KEY) return null;

  try {
    const system = `คุณช่วยแยกข้อมูลจากข้อความของพนักงานว่าเขาต้องการ "ยืมอุปกรณ์" จากคลังบริษัทหรือไม่ นี่คือระบบภายในสำหรับยืมของใช้ในงาน ไม่ใช่การซื้อขายหรือขอสิ่งอื่น

- ถ้าข้อความดูเหมือนต้องการยืมอุปกรณ์ (ไม่ว่าจะพิมพ์เป็นประโยคธรรมดา ใส่คำลงท้าย มีคำอื่นปนมา หรือพิมพ์สั้นๆ) ให้ isBorrowRequest = true แล้วแยกชื่ออุปกรณ์ (item) และจำนวน (quantity) ถ้าบอกมา
- ถ้าจำนวนไม่ได้ระบุมาในข้อความ ให้ quantity เป็น null (ห้ามเดา ห้ามใส่ 1 เอง)
- ถ้าข้อความเป็นคำถามทั่วไป ทักทาย หรือไม่เกี่ยวกับการยืมของเลย ให้ isBorrowRequest = false, item = null, quantity = null
${awaitingContext ? `- บริบทเพิ่มเติม: ${awaitingContext}` : ""}

ตอบกลับเป็น JSON เท่านั้น ห้ามมีข้อความอื่นนอกเหนือจาก JSON ในรูปแบบนี้เป๊ะๆ:
{"isBorrowRequest": true หรือ false, "item": string หรือ null, "quantity": number หรือ null}`;

    const raw = await callGroq(system, text.slice(0, 500), { maxTokens: 200, jsonMode: true });
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return {
      isBorrowRequest: !!parsed.isBorrowRequest,
      item: typeof parsed.item === "string" && parsed.item.trim() ? parsed.item.trim() : null,
      quantity: Number.isInteger(parsed.quantity) && parsed.quantity > 0 ? parsed.quantity : null,
    };
  } catch (error) {
    logError("LINE borrow-intent extraction request failed", error);
    return null;
  }
}
