"use server";

import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function authenticate(
  prevState: string | undefined,
  formData: FormData,
) {
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
    console.error("Error creating log:", error);
    return { success: false };
  }
}

export async function getUsers() {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return { success: false, error: "Unauthorized" };

    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { logs: true }
        }
      }
    });

    return { success: true, data: JSON.parse(JSON.stringify(users)) };
  } catch (error) {
    console.error("Error fetching users:", error);
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
    console.error("Error updating role:", error);
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
    console.error("Registration error:", error);
    return "Failed to register user.";
  }

  redirect("/login");
}
