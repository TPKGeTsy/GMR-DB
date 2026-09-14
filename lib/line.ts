import crypto from "crypto";
import { logError } from "./logger";

const LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply";

/** Verifies the `X-Line-Signature` header against the raw request body using
 *  the channel secret, per LINE's webhook spec. Must run against the exact
 *  raw bytes LINE sent — re-serializing the parsed JSON would produce a
 *  different signature and always fail. */
export function verifyLineSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret || !signature) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");

  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);
  if (expectedBuf.length !== signatureBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}

/** Sends a single text reply using a webhook event's one-time replyToken
 *  (valid for ~30 seconds, single use). Failures are logged, not thrown —
 *  the webhook itself must still return 200 to LINE regardless. */
export async function replyLineMessage(replyToken: string, text: string): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    logError("LINE reply skipped", new Error("LINE_CHANNEL_ACCESS_TOKEN is not set"));
    return;
  }

  try {
    const res = await fetch(LINE_REPLY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        replyToken,
        messages: [{ type: "text", text: text.slice(0, 5000) }],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logError("LINE reply failed", new Error(`HTTP ${res.status}`), { body });
    }
  } catch (error) {
    logError("LINE reply request failed", error);
  }
}
