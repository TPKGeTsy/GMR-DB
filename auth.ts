import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import Credentials from "next-auth/providers/credentials";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export const { auth, signIn, signOut, handlers } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      async authorize(credentials) {
        const parsedCredentials = z
          .object({ username: z.string(), password: z.string() })
          .safeParse(credentials);

        if (parsedCredentials.success) {
          const { username, password } = parsedCredentials.data;
          const user = await prisma.user.findUnique({
            where: { username },
          });
          if (!user) return null;

          if (user.lockedUntil && user.lockedUntil > new Date()) {
            return null;
          }

          if (!user.approved) {
            return null;
          }

          const passwordsMatch = await bcrypt.compare(password, user.password);

          if (!passwordsMatch) {
            const attempts = user.failedLoginAttempts + 1;
            const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;
            await prisma.user.update({
              where: { id: user.id },
              data: {
                failedLoginAttempts: shouldLock ? 0 : attempts,
                lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null,
              },
            });
            return null;
          }

          if (user.failedLoginAttempts > 0 || user.lockedUntil) {
            await prisma.user.update({
              where: { id: user.id },
              data: { failedLoginAttempts: 0, lockedUntil: null },
            });
          }

          return user;
        }

        return null;
      },
    }),
  ],
});
