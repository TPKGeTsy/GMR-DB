import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  // https://nextjs.org/docs/app/building-your-application/routing/middleware#matcher
  // `uploads` must stay public — it serves user-uploaded asset/vehicle images
  // referenced from pages like /catalog that don't require login, and even
  // next/image's own server-side fetch for optimization needs to reach it
  // without a session cookie.
  // `models` must stay public too — the face-api.js model files it serves
  // are fetched directly by the browser from the public /checkin kiosk page,
  // which nobody is logged in on. Without this exclusion, every model file
  // request got redirected to /login and came back as an HTML page instead
  // of the JSON/binary model data, breaking face recognition for anyone
  // without an existing session — i.e. everyone on the actual kiosk.
  matcher: ["/((?!api|_next/static|_next/image|uploads|models|.*\\.png$).*)"],
};
