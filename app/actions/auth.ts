"use server";

import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { bangkokDayRange } from "@/lib/datetime";
import { canManageUsers } from "@/lib/roles";

export async function authenticate(
  prevState: string | undefined,
  formData: FormData,
) {
  const username = formData.get("username") as string;

  if (username) {
    const user = await prisma.user.findUnique({
      where: { username },
      select: { lockedUntil: true },
    });
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      return `บัญชีถูกล็อกชั่วคราวจากการใส่รหัสผ่านผิดหลายครั้ง กรุณาลองใหม่ในอีก ${minutesLeft} นาที`;
    }
  }

  try {
    await signIn("credentials", formData);
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return "Invalid credentials.";
        default:
          return "Something went wrong.";
      }
    }
    throw error;
  }
}

import { auth } from "@/auth";

export async function createActivityLog(action: string, details?: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false };

    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action,
        details,
      },
    });
    return { success: true };
  } catch (error) {
    logError("Error creating log:", error);
    return { success: false };
  }
}

export async function getUsers({ page = 1, limit = 20 }: { page?: number; limit?: number } = {}) {
  try {
    const session = await auth();
    if (!canManageUsers(session?.user?.role)) return { success: false, error: "Unauthorized" };

    const skip = (page - 1) * limit;
    const [users, totalCount] = await Promise.all([
      prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          _count: {
            select: { logs: true }
          }
        }
      }),
      prisma.user.count(),
    ]);

    return {
      success: true,
      data: JSON.parse(JSON.stringify(users)),
      totalPages: Math.ceil(totalCount / limit),
    };
  } catch (error) {
    logError("Error fetching users:", error);
    return { success: false, error: "Failed to fetch users" };
  }
}

export async function updateUserRole(userId: string, role: string) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return { success: false, error: "Unauthorized" };

    const user = await prisma.user.update({
      where: { id: userId },
      data: { role },
    });

    await createActivityLog("CHANGE_USER_ROLE", `Changed user ${user.username} role to ${role}`);

    revalidatePath("/users");
    return { success: true, data: JSON.parse(JSON.stringify(user)) };
  } catch (error) {
    logError("Error updating role:", error);
    return { success: false, error: "Failed to update role" };
  }
}

export async function registerUser(
  prevState: string | undefined,
  formData: FormData,
) {
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;
  const fullName = formData.get("fullName") as string;

  if (!username || !password || !confirmPassword) {
    return "Please fill in all fields.";
  }

  if (password !== confirmPassword) {
    return "Passwords do not match.";
  }

  if (password.length < 6) {
    return "Password must be at least 6 characters long.";
  }

  try {
    const existingUser = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      return "Username already exists.";
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        fullName,
        role: "USER",
      },
    });
  } catch (error) {
    logError("Registration error:", error);
    return "Failed to register user.";
  }

  redirect("/login");
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };

    const isSelf = session.user.id === userId;
    const isAdmin = session.user.role === "ADMIN";
    if (!isSelf && !isAdmin) return { success: false, error: "Unauthorized" };

    if (newPassword.length < 6) {
      return { success: false, error: "Password must be at least 6 characters long." };
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return { success: false, error: "User not found" };

    if (isSelf) {
      const currentMatches = await bcrypt.compare(currentPassword, user.password);
      if (!currentMatches) return { success: false, error: "Current password is incorrect." };
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword, failedLoginAttempts: 0, lockedUntil: null },
    });

    await createActivityLog(
      isSelf ? "CHANGE_PASSWORD" : "ADMIN_RESET_PASSWORD",
      isSelf ? "Changed own password" : `Reset password for ${user.username}`
    );

    return { success: true };
  } catch (error) {
    logError("Error changing password:", error);
    return { success: false, error: "Failed to change password" };
  }
}

/** Clears a user's LINE link (admin-only). The LINE bot itself refuses to
 *  re-link an account that's already linked to a *different* LINE user and
 *  tells them to contact an admin — this is that escape hatch. Once
 *  cleared, they just send their username+password again in a private LINE
 *  chat to link fresh (to this account or a different one — lineUserId is
 *  unique, so only one account can hold a given LINE id at a time). */
export async function unlinkLineAccount(userId: string) {
  try {
    const session = await auth();
    if (!canManageUsers(session?.user?.role)) return { success: false, error: "Unauthorized" };

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return { success: false, error: "User not found" };
    if (!user.lineUserId) return { success: false, error: "This account isn't linked to LINE." };

    await prisma.user.update({ where: { id: userId }, data: { lineUserId: null } });

    await createActivityLog("UNLINK_LINE", `Unlinked LINE account for ${user.username}`);

    revalidatePath(`/users/${userId}`);
    return { success: true };
  } catch (error) {
    logError("Error unlinking LINE account:", error);
    return { success: false, error: "Failed to unlink LINE account" };
  }
}

/** Sets or clears a user's nickname — self or admin. Nicknames are unique
 *  (enforced at the DB level) since they're shown as the button labels an
 *  admin/operator picks from when opening OT for someone over LINE. */
export async function updateNickname(userId: string, nickname: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };

    const isSelf = session.user.id === userId;
    const isAdmin = session.user.role === "ADMIN";
    if (!isSelf && !isAdmin) return { success: false, error: "Unauthorized" };

    const trimmed = nickname.trim();
    if (trimmed.length > 20) {
      return { success: false, error: "ชื่อเล่นต้องไม่เกิน 20 ตัวอักษร" };
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return { success: false, error: "User not found" };

    await prisma.user.update({
      where: { id: userId },
      data: { nickname: trimmed || null },
    });

    await createActivityLog("UPDATE_NICKNAME", `Set nickname for ${user.username} to "${trimmed}"`);

    revalidatePath(`/users/${userId}`);
    return { success: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { success: false, error: "ชื่อเล่นนี้มีคนใช้แล้ว กรุณาเลือกชื่ออื่น" };
    }
    logError("Error updating nickname:", error);
    return { success: false, error: "Failed to update nickname" };
  }
}

export interface ActivityLogRow {
  id: string;
  action: string;
  details: string | null;
  createdAt: string;
}

async function canViewActivityLogs(userId: string): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) return false;
  return session.user.id === userId || session.user.role === "ADMIN";
}

/** Filtered/paginated activity log for one user's profile page — self or
 *  admin, same audience as the page itself. Replaces the old hardcoded
 *  "most recent 50, unfiltered" list with date-range + action-type filters
 *  (same URL-param-driven pattern AttendanceFilters uses). */
export async function getUserActivityLogs(
  userId: string,
  { from, to, action, page = 1, limit = 20 }: { from?: string; to?: string; action?: string; page?: number; limit?: number } = {}
): Promise<{ success: true; data: ActivityLogRow[]; totalPages: number } | { success: false; error: string }> {
  try {
    if (!(await canViewActivityLogs(userId))) return { success: false, error: "Unauthorized" };

    const createdAtFilter: { gte?: Date; lt?: Date } = {};
    if (from) createdAtFilter.gte = bangkokDayRange(from).start;
    if (to) createdAtFilter.lt = bangkokDayRange(to).end;

    const where = {
      userId,
      ...(Object.keys(createdAtFilter).length > 0 ? { createdAt: createdAtFilter } : {}),
      ...(action ? { action } : {}),
    };

    const skip = (page - 1) * limit;
    const [logs, totalCount] = await Promise.all([
      prisma.activityLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit }),
      prisma.activityLog.count({ where }),
    ]);

    return {
      success: true,
      data: logs.map((l) => ({ id: l.id, action: l.action, details: l.details, createdAt: l.createdAt.toISOString() })),
      totalPages: Math.max(1, Math.ceil(totalCount / limit)),
    };
  } catch (error) {
    logError("Error fetching user activity logs:", error);
    return { success: false, error: "Failed to load activity logs" };
  }
}

/** Distinct action values this user actually has logs for — populates the
 *  action-type filter dropdown without hardcoding every action string used
 *  anywhere in the app (which drifts as features are added). */
export async function getUserActivityActions(userId: string): Promise<string[]> {
  if (!(await canViewActivityLogs(userId))) return [];
  const rows = await prisma.activityLog.findMany({
    where: { userId },
    distinct: ["action"],
    select: { action: true },
    orderBy: { action: "asc" },
  });
  return rows.map((r) => r.action);
}
