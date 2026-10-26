import { NextRequest, NextResponse } from "next/server";
import { setRelay } from "@/app/actions/modbus";

export const dynamic = "force-dynamic";

/**
 * Switch one channel. The page calls this with fetch() instead of the
 * setRelay server action because Next.js runs a page's server actions one at a
 * time: a press would wait for the previous press's confirmation from the Pi.
 * Plain requests run side by side, so several channels can be switched at once.
 *
 * It is the same setRelay() as the action — it checks the login itself — plus
 * the two checks server actions get for free against cross-site requests: the
 * Origin must be this site, and the body must be JSON (which a cross-origin
 * <form> can't send).
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
    if (!sameSite) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ success: false, error: "Expected JSON" }, { status: 415 });
  }

  let body: { index?: unknown; on?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.index !== "number" || typeof body.on !== "boolean") {
    return NextResponse.json({ success: false, error: "Expected { index: number, on: boolean }" }, { status: 400 });
  }

  return NextResponse.json(await setRelay(body.index, body.on));
}
