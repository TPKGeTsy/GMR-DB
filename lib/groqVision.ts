import { logError } from "@/lib/logger";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
// Same Groq account as the LINE assistant; the model can be swapped with an env var.
const DEFAULT_VISION_MODEL = "qwen/qwen3.8-27b";

/** Asks the vision model about one picture. Returns its text reply, or a short
 *  Thai reason why there is none (never throws). */
export async function askGroqAboutImage(
  prompt: string,
  imageDataUrl: string,
  maxTokens = 950
): Promise<{ ok: true; text: string; truncated: boolean } | { ok: false; error: string; retryAfter?: number }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return { ok: false, error: "ยังไม่ได้ตั้งค่า GROQ_API_KEY ในเซิร์ฟเวอร์" };
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.GROQ_VISION_MODEL || DEFAULT_VISION_MODEL,
        temperature: 0,
        max_tokens: maxTokens,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(55_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 429) {
        // "Please try again in 31.2s" (or the Retry-After header): how long to wait for the quota.
        const header = Number(res.headers.get("retry-after"));
        const fromBody = /try again in\s+(?:(\d+)m)?\s*([\d.]+)s/i.exec(body);
        const retryAfter = Number.isFinite(header) && header > 0 ? header : fromBody ? Number(fromBody[1] ?? 0) * 60 + Number(fromBody[2]) : 30;
        return { ok: false, error: "Groq ใช้โควตาต่อนาทีเต็ม รอสักครู่", retryAfter: Math.ceil(Math.min(retryAfter, 120)) };
      }
      logError("Groq vision call failed", new Error(`HTTP ${res.status}`), { body: body.slice(0, 500) });
      return { ok: false, error: "อ่านรูปไม่สำเร็จ ลองใหม่อีกครั้ง" };
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) return { ok: false, error: "โมเดลไม่ตอบกลับ ลองใหม่อีกครั้ง" };
    // finish_reason "length" = the model ran out of room, so its last line may be cut off.
    return { ok: true, text, truncated: data?.choices?.[0]?.finish_reason === "length" };
  } catch (error) {
    logError("Groq vision call error", error);
    return { ok: false, error: "อ่านรูปไม่สำเร็จ (หมดเวลาหรือเครือข่ายมีปัญหา)" };
  }
}
