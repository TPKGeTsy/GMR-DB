"use server";

import prisma from "@/lib/prisma";
import { auth } from "@/auth";
import { createActivityLog } from "./auth";
import { revalidatePath } from "next/cache";

async function canManageProject(projectId: string, userId: string, role: string | undefined) {
  if (role === "ADMIN") return true;
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { createdById: true } });
  return project?.createdById === userId;
}

/** Minimal user list (id + display name) any logged-in user can fetch —
 *  used to populate the "add teammate" picker on a project. */
export async function getUserOptions() {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };

    const users = await prisma.user.findMany({
      orderBy: { username: "asc" },
      select: { id: true, username: true, fullName: true },
    });

    return {
      success: true,
      data: users.map((u) => ({ id: u.id, name: u.fullName || u.username })),
    };
  } catch (error) {
    console.error("Error fetching user options:", error);
    return { success: false, error: "Failed to load users" };
  }
}

export async function createProject(formData: FormData) {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "กรุณาเข้าสู่ระบบก่อน" };

    const name = formData.get("name") as string;
    const description = (formData.get("description") as string) || null;
    const client = (formData.get("client") as string) || null;
    const startDateStr = formData.get("startDate") as string;
    const endDateStr = formData.get("endDate") as string;

    if (!name?.trim()) return { success: false, error: "กรุณากรอกชื่อโปรเจกต์" };

    const project = await prisma.project.create({
      data: {
        name: name.trim(),
        description,
        client,
        startDate: startDateStr ? new Date(startDateStr) : null,
        endDate: endDateStr ? new Date(endDateStr) : null,
        createdById: session.user.id,
        members: {
          create: { userId: session.user.id },
        },
      },
    });

    await createActivityLog("CREATE_PROJECT", `Created project ${name}`);

    revalidatePath("/projects");
    return { success: true, data: JSON.parse(JSON.stringify(project)) };
  } catch (error) {
    console.error("Error creating project:", error);
    return { success: false, error: "สร้างโปรเจกต์ไม่สำเร็จ" };
  }
}

export async function getProjects() {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { username: true, fullName: true } },
        _count: { select: { members: true } },
      },
    });
    return { success: true, data: JSON.parse(JSON.stringify(projects)) };
  } catch (error) {
    console.error("Error fetching projects:", error);
    return { success: false, error: "Failed to load projects" };
  }
}

export async function getMyProjects() {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };

    const projects = await prisma.project.findMany({
      where: { members: { some: { userId: session.user.id } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, status: true },
    });

    return { success: true, data: JSON.parse(JSON.stringify(projects)) };
  } catch (error) {
    console.error("Error fetching my projects:", error);
    return { success: false, error: "Failed to load your projects" };
  }
}

export async function getProjectById(id: string) {
  try {
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, username: true, fullName: true } },
        members: {
          orderBy: { addedAt: "asc" },
          include: { user: { select: { id: true, username: true, fullName: true } } },
        },
      },
    });

    if (!project) return { success: false, error: "ไม่พบโปรเจกต์นี้" };
    return { success: true, data: JSON.parse(JSON.stringify(project)) };
  } catch (error) {
    console.error("Error fetching project:", error);
    return { success: false, error: "Failed to load project" };
  }
}

export async function addProjectMember(projectId: string, userId: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };
    if (!(await canManageProject(projectId, session.user.id, session.user.role))) {
      return { success: false, error: "Unauthorized" };
    }

    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (member) return { success: false, error: "พนักงานคนนี้อยู่ในโปรเจกต์นี้แล้ว" };

    await prisma.projectMember.create({ data: { projectId, userId } });

    const [project, addedUser] = await Promise.all([
      prisma.project.findUnique({ where: { id: projectId } }),
      prisma.user.findUnique({ where: { id: userId } }),
    ]);
    await createActivityLog(
      "ADD_PROJECT_MEMBER",
      `Added ${addedUser?.username} to project ${project?.name}`
    );

    revalidatePath(`/projects/${projectId}`);
    return { success: true };
  } catch (error) {
    console.error("Error adding project member:", error);
    return { success: false, error: "เพิ่มพนักงานไม่สำเร็จ" };
  }
}

export async function removeProjectMember(projectId: string, userId: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };
    if (!(await canManageProject(projectId, session.user.id, session.user.role))) {
      return { success: false, error: "Unauthorized" };
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (project?.createdById === userId) {
      return { success: false, error: "ไม่สามารถลบเจ้าของโปรเจกต์ออกได้" };
    }

    await prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId } },
    });

    revalidatePath(`/projects/${projectId}`);
    return { success: true };
  } catch (error) {
    console.error("Error removing project member:", error);
    return { success: false, error: "นำพนักงานออกไม่สำเร็จ" };
  }
}

export async function updateProjectStatus(projectId: string, status: "ACTIVE" | "COMPLETED" | "ON_HOLD") {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };
    if (!(await canManageProject(projectId, session.user.id, session.user.role))) {
      return { success: false, error: "Unauthorized" };
    }

    await prisma.project.update({ where: { id: projectId }, data: { status } });

    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/projects");
    return { success: true };
  } catch (error) {
    console.error("Error updating project status:", error);
    return { success: false, error: "อัพเดทสถานะไม่สำเร็จ" };
  }
}
