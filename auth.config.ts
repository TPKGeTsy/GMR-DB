import type { NextAuthConfig } from "next-auth";

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
      const isOnLoginPage = nextUrl.pathname.startsWith("/login");
      const isOnRegisterPage = nextUrl.pathname.startsWith("/register");
      const isOnCheckInPage = nextUrl.pathname.startsWith("/checkin");

      if (isOnLoginPage || isOnRegisterPage) {
        if (isLoggedIn) return Response.redirect(new URL("/", nextUrl));
        return true;
      }

      // /checkin is a public kiosk page — no login required, that's the point of face check-in
      if (isOnCheckInPage) {
        return true;
      }

      if (!isLoggedIn) {
        return false;
      }

      const role = auth.user?.role;
      const isOwnProfile = isOnUsers && nextUrl.pathname === `/users/${auth.user?.id}`;

      // /users is ADMIN only, except a user's own profile page (e.g. to register their own face)
      if (isOnUsers && role !== "ADMIN" && !isOwnProfile) {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }

      // /inventory is ADMIN or OPERATOR
      if (isOnInventory && role !== "ADMIN" && role !== "OPERATOR") {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }

      // /attendance is ADMIN only (HR data across all employees)
      if (isOnAttendance && role !== "ADMIN") {
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
