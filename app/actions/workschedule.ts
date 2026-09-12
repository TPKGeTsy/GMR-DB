"use server";

import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { auth } from "@/auth";
import { createActivityLog } from "./auth";
import { revalidatePath } from "next/cache";

export async function createScheduleEntry(
  title: string,
  startAt: string,
  endAt: string,
  projectId: string | null,
  note: string
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "กรุณาเข้าสู่ระบบก่อน" };

    if (!title?.trim()) return { success: false, error: "กรุณากรอกหัวข้องาน" };

    const start = new Date(startAt);
    const end = new Date(endAt);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return { success: false, error: "วันเวลาไม่ถูกต้อง" };
    }
    if (end <= start) {
      return { success: false, error: "เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่มต้น" };
    }

    if (projectId) {
      const isMember = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: session.user.id } },
      });
      if (!isMember) return { success: false, error: "คุณไม่ได้อยู่ในโปรเจกต์นี้" };
    }

    const entry = await prisma.workSchedule.create({
      data: {
        userId: session.user.id,
        projectId: projectId || null,
        title: title.trim(),
        startAt: start,
        endAt: end,
        note: note?.trim() || null,
      },
    });

    await createActivityLog("ADD_WORK_SCHEDULE", `Added schedule: ${title}`);

    revalidatePath("/work-schedule");
    return { success: true, data: JSON.parse(JSON.stringify(entry)) };
  } catch (error) {
    logError("Error creating schedule entry:", error);
    return { success: false, error: "บันทึกตารางงานไม่สำเร็จ" };
  }
}

export async function deleteScheduleEntry(id: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };

    const entry = await prisma.workSchedule.findUnique({ where: { id } });
    if (!entry) return { success: false, error: "ไม่พบรายการนี้" };
    if (entry.userId !== session.user.id && session.user.role !== "ADMIN") {
      return { success: false, error: "Unauthorized" };
    }

    await prisma.workSchedule.delete({ where: { id } });

    revalidatePath("/work-schedule");
    return { success: true };
  } catch (error) {
    logError("Error deleting schedule entry:", error);
    return { success: false, error: "ลบรายการไม่สำเร็จ" };
  }
}

export async function getMySchedule() {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };

    const entries = await prisma.workSchedule.findMany({
      where: { userId: session.user.id },
      orderBy: { startAt: "desc" },
      include: { project: { select: { id: true, name: true } } },
    });

    return { success: true, data: JSON.parse(JSON.stringify(entries)) };
  } catch (error) {
    logError("Error fetching my schedule:", error);
    return { success: false, error: "Failed to load schedule" };
  }
}

export async function getAllSchedules(limit = 200) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return { success: false, error: "Unauthorized" };

    const entries = await prisma.workSchedule.findMany({
      orderBy: { startAt: "desc" },
      take: limit,
      include: {
        project: { select: { id: true, name: true } },
        user: { select: { username: true, fullName: true } },
      },
    });

    return { success: true, data: JSON.parse(JSON.stringify(entries)) };
  } catch (error) {
    logError("Error fetching all schedules:", error);
    return { success: false, error: "Failed to load schedules" };
  }
}
