import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { isAgentMode } from "@/lib/modbusMode";

export const dynamic = "force-dynamic";

/**
 * "Someone is using the /modbus page right now." The page calls this when it
 * is opened, when the tab comes back, and (throttled) on any interaction. The
 * Raspberry Pi agent is told about it with its next poll and polls fast for the
 * next minute, so a button press reaches the lights in a fraction of a second
 * even where the web app can't push to the Pi (Vercel). When nobody is around
 * the Pi polls slowly, which keeps the request count down.
 *
 * Only matters in agent mode; a no-op otherwise. Needs a login, and the same
 * same-site / JSON checks the switch endpoint uses.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin) {
    let sameSite = false;
    try {
      sameSite = new URL(origin).host === (request.headers.get("x-forwarded-host") ?? request.headers.get("host"));
    } catch {
      /* malformed Origin: refuse below */
    }
    if (!sameSite) return NextResponse.json({ ok: false }, { status: 403 });
  }
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ ok: false }, { status: 415 });
  }

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ ok: false }, { status: 401 });
  if (!isAgentMode()) return NextResponse.json({ ok: true, recorded: false });

  try {
    const now = new Date();
    await prisma.modbusWebActivity.upsert({ where: { id: 1 }, create: { id: 1, seenAt: now }, update: { seenAt: now } });
    return NextResponse.json({ ok: true, recorded: true });
  } catch (error) {
    // Table not migrated yet, or the database hiccuped: only speed is lost.
    logError("Modbus web-activity write failed:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
