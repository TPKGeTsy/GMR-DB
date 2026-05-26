"use server";

import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";

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

export async function registerUser(
  prevState: string | undefined,
  formData: FormData,
) {
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

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
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    return "Failed to register user.";
  }

  redirect("/login");
}
