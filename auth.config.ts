import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnInventory = nextUrl.pathname.startsWith("/inventory");
      const isOnUsers = nextUrl.pathname.startsWith("/users");
      const isOnLoginPage = nextUrl.pathname.startsWith("/login");
      const isOnRegisterPage = nextUrl.pathname.startsWith("/register");

      if (isOnLoginPage || isOnRegisterPage) {
        if (isLoggedIn) return Response.redirect(new URL("/", nextUrl));
        return true;
      }

      if (!isLoggedIn) {
        return false;
      }

      const user = auth.user as any;
      const role = user?.role;

      // /users is ADMIN only
      if (isOnUsers && role !== "ADMIN") {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }

      // /inventory is ADMIN or OPERATOR
      if (isOnInventory && role !== "ADMIN" && role !== "OPERATOR") {
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
        (session.user as any).role = token.role as string;
      }
      return session;
    },
    jwt({ token, user }) {
      if (user) {
        token.username = (user as any).username;
        token.role = (user as any).role;
      }
      return token;
    },
  },
  providers: [], // Add providers with an empty array for now
} satisfies NextAuthConfig;
