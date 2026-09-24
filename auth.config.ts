import type { NextAuthConfig } from "next-auth";
import { isOtManagerRole, canManageUsers, isOwner } from "@/lib/roles";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  // Default (no config) is a 30-day rolling session — too long for a company
  // tool where a lost/shared device would stay logged in for a month.
  // 7 days, refreshed on activity, so active users aren't logged out mid-use.
  session: {
    maxAge: 7 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnInventory = nextUrl.pathname.startsWith("/inventory");
      const isOnUsers = nextUrl.pathname.startsWith("/users");
      const isOnAttendance = nextUrl.pathname.startsWith("/attendance");
      const isOnWages = nextUrl.pathname.startsWith("/wages");
      const isOnSummary = nextUrl.pathname.startsWith("/summary");
      const isOnOt = nextUrl.pathname.startsWith("/ot");
      const isOnLoginPage = nextUrl.pathname.startsWith("/login");
      const isOnRegisterPage = nextUrl.pathname.startsWith("/register");
      const isOnUsersPending = nextUrl.pathname.startsWith("/users/pending");

      if (isOnLoginPage || isOnRegisterPage) {
        if (isLoggedIn) return Response.redirect(new URL("/", nextUrl));
        return true;
      }

      if (!isLoggedIn) {
        return false;
      }

      const role = auth.user?.role;
      const isOwnProfile = isOnUsers && nextUrl.pathname === `/users/${auth.user?.id}`;

      // /users/pending (approving new registrations) is for the account
      // owner only — deliberately narrower than the ADMIN/OPERATOR check
      // below, so other admins aren't pulled into approval duty.
      if (isOnUsersPending && !isOwner(auth.user?.username)) {
        return Response.redirect(new URL("/users", nextUrl));
      }

      // /users is ADMIN or OPERATOR, except a user's own profile page (e.g.
      // to register their own face) which anyone logged in can reach
      if (isOnUsers && !canManageUsers(role) && !isOwnProfile) {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }

      // /inventory is ADMIN or OPERATOR
      if (isOnInventory && role !== "ADMIN" && role !== "OPERATOR") {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }

      // /ot is ADMIN, OPERATOR, or SENIOR — same audience that can grant/approve OT via LINE
      if (isOnOt && !isOtManagerRole(role)) {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }

      // /attendance is ADMIN only (HR data across all employees)
      if (isOnAttendance && role !== "ADMIN") {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }

      // /wages is ADMIN only (intern pay grades and rates are payroll data)
      if (isOnWages && role !== "ADMIN") {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }

      // /summary is ADMIN only, same audience as /attendance and /wages
      if (isOnSummary && role !== "ADMIN") {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }

      return true;
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      if (session.user && token.username) {
        session.user.username = token.username as string;
      }
      if (session.user && token.role) {
        session.user.role = token.role as string;
      }
      return session;
    },
    jwt({ token, user }) {
      if (user) {
        token.username = user.username;
        token.role = user.role;
      }
      return token;
    },
  },
  providers: [], // Add providers with an empty array for now
} satisfies NextAuthConfig;
