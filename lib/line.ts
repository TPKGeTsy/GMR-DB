import crypto from "crypto";
import { logError } from "./logger";

const LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply";
const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";

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

export interface QuickReplyOption {
  label: string;
  text: string;
}

function buildTextMessage(text: string, quickReplies?: QuickReplyOption[]) {
  return {
    type: "text",
    text: text.slice(0, 5000),
    ...(quickReplies && {
      quickReply: {
        items: quickReplies.map((q) => ({
          type: "action",
          action: { type: "message", label: q.label.slice(0, 20), text: q.text },
        })),
      },
    }),
  };
}

async function postToLine(url: string, body: unknown, scope: string): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    logError(scope, new Error("LINE_CHANNEL_ACCESS_TOKEN is not set"));
    return;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const responseBody = await res.text().catch(() => "");
      logError(scope, new Error(`HTTP ${res.status}`), { responseBody });
    }
  } catch (error) {
    logError(scope, error);
  }
}

/** Sends a single text reply using a webhook event's one-time replyToken
 *  (valid for ~30 seconds, single use). Failures are logged, not thrown —
 *  the webhook itself must still return 200 to LINE regardless. */
export async function replyLineMessage(
  replyToken: string,
  text: string,
  quickReplies?: QuickReplyOption[]
): Promise<void> {
  await postToLine(
    LINE_REPLY_URL,
    { replyToken, messages: [buildTextMessage(text, quickReplies)] },
    "LINE reply failed"
  );
}

/** Sends a text message to a specific LINE user outside of any reply-token
 *  flow — used by the check-in reminder cron, which isn't reacting to an
 *  incoming webhook event. */
export async function pushLineMessage(
  toLineUserId: string,
  text: string,
  quickReplies?: QuickReplyOption[]
): Promise<void> {
  await postToLine(
    LINE_PUSH_URL,
    { to: toLineUserId, messages: [buildTextMessage(text, quickReplies)] },
    "LINE push failed"
  );
}
