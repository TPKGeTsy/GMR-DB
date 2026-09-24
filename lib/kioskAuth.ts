import { cookies } from "next/headers";

// getFaceRoster/recordCheckIn used to be reachable by anyone who could load
// the public /checkin page — no login is required there by design (it's a
// walk-up kiosk), but that also meant a remote attacker could call those
// server actions directly (bypassing the camera/UI entirely) with a
// fabricated confidence score and falsify real attendance/OT/wage records.
// A secret baked into the page's own JS wouldn't help — anyone loading that
// same public page could read it too. Instead, the secret is set once, out
// of band, on the one physical kiosk device via /checkin/setup, and stored
// as an httpOnly cookie the server checks on every roster fetch and
// check-in — a remote attacker who never completed that device-local setup
// has no cookie to send.
const KIOSK_COOKIE = "kiosk_token";
const TEN_YEARS_SECONDS = 10 * 365 * 24 * 60 * 60;

/** True when KIOSK_SECRET isn't configured (e.g. local dev) — same
 *  intentionally-permissive fallback CRON_SECRET already uses elsewhere. */
export async function isKioskAuthorized(): Promise<boolean> {
  const secret = process.env.KIOSK_SECRET;
  if (!secret) return true;
  const store = await cookies();
  return store.get(KIOSK_COOKIE)?.value === secret;
}

export async function setKioskCookie(secret: string) {
  const store = await cookies();
  store.set(KIOSK_COOKIE, secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: TEN_YEARS_SECONDS,
    path: "/",
  });
}
