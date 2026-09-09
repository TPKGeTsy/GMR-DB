import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  // https://nextjs.org/docs/app/building-your-application/routing/middleware#matcher
  // `uploads` must stay public — it serves user-uploaded asset/vehicle images
  // referenced from pages like /catalog that don't require login, and even
  // next/image's own server-side fetch for optimization needs to reach it
  // without a session cookie.
  matcher: ["/((?!api|_next/static|_next/image|uploads|.*\\.png$).*)"],
};
