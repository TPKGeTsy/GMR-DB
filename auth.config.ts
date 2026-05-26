import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnLoginPage = nextUrl.pathname.startsWith("/login");
      const isOnRegisterPage = nextUrl.pathname.startsWith("/register");

      if (isOnLoginPage || isOnRegisterPage) {
        if (isLoggedIn) return Response.redirect(new URL("/", nextUrl));
        return true;
      }

      if (!isLoggedIn) {
        return false; // Redirect unauthenticated users to login page
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
      return session;
    },
    jwt({ token, user }) {
      if (user) {
        token.username = user.username;
      }
      return token;
    },
  },
  providers: [], // Add providers with an empty array for now
} satisfies NextAuthConfig;
