import prisma from "./prisma";
import { logError } from "./logger";
import { buildDailySummary } from "./attendance";
import { formatThaiDate, formatThaiDateTime } from "./datetime";
import type { User } from "@prisma/client";

const MODEL = "gemini-3.6-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logError("LINE assistant skipped", new Error("GEMINI_API_KEY is not set"));
    return null;
  }

  try {
    const context = await buildUserContext(user);
    const system = extraContext ? `${SYSTEM_PROMPT}\n\n${context}\n\n${extraContext}` : `${SYSTEM_PROMPT}\n\n${context}`;

    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: question.slice(0, 1000) }] }],
        // Simple factual Q&A over a small data snapshot doesn't need extended
        // reasoning — thinking was on by default and burning ~10x more
        // tokens (and several extra seconds of latency) than the answer itself.
        generationConfig: { maxOutputTokens: 400, thinkingConfig: { thinkingLevel: "low" } },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logError("LINE assistant call failed", new Error(`HTTP ${res.status}`), { body });
      return null;
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return typeof text === "string" && text.trim() ? text.trim() : null;
  } catch (error) {
    logError("LINE assistant request failed", error, { userId: user.id });
    return null;
  }
}
