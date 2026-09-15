"use server";

import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { auth } from "@/auth";
import { createActivityLog } from "./auth";
import { revalidatePath } from "next/cache";
import { checkRateLimit } from "@/lib/rateLimit";
import { validateProjectFile } from "@/lib/uploads";
import { saveUploadedFile, deleteUploadedFile } from "@/lib/storage";
import { z } from "zod";

const createProjectSchema = z
  .object({
    name: z.string().trim().min(1, "กรุณากรอกชื่อโปรเจกต์"),
    description: z.string().trim().optional(),
    client: z.string().trim().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  })
  .refine(
    (data) => !data.startDate || !data.endDate || new Date(data.endDate) >= new Date(data.startDate),
    { message: "วันสิ้นสุด (Deadline) ต้องไม่ก่อนวันเริ่มต้น", path: ["endDate"] }
  );

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
    logError("Error fetching user options:", error);
    return { success: false, error: "Failed to load users" };
  }
}

export async function createProject(formData: FormData) {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "กรุณาเข้าสู่ระบบก่อน" };

    const rateLimit = await checkRateLimit(`createProject:${session.user.id}`, { maxAttempts: 10, windowMs: 60_000 });
    if (!rateLimit.allowed) {
      return { success: false, error: `สร้างโปรเจกต์ถี่เกินไป กรุณารออีก ${rateLimit.retryAfterSeconds} วินาที` };
    }

    const parsed = createProjectSchema.safeParse({
      name: formData.get("name") as string | null,
      description: (formData.get("description") as string | null) || undefined,
      client: (formData.get("client") as string | null) || undefined,
      startDate: (formData.get("startDate") as string | null) || undefined,
      endDate: (formData.get("endDate") as string | null) || undefined,
    });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message || "ข้อมูลไม่ถูกต้อง" };
    }
    const { name, description, client, startDate: startDateStr, endDate: endDateStr } = parsed.data;

    const project = await prisma.project.create({
      data: {
        name,
        description: description || null,
        client: client || null,
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
    logError("Error creating project:", error);
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
    logError("Error fetching projects:", error);
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
    logError("Error fetching my projects:", error);
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
        files: {
          orderBy: { createdAt: "desc" },
          include: { uploadedBy: { select: { id: true, username: true, fullName: true } } },
        },
      },
    });

    if (!project) return { success: false, error: "ไม่พบโปรเจกต์นี้" };
    return { success: true, data: JSON.parse(JSON.stringify(project)) };
  } catch (error) {
    logError("Error fetching project:", error);
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
    logError("Error adding project member:", error);
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
    logError("Error removing project member:", error);
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
    logError("Error updating project status:", error);
    return { success: false, error: "อัพเดทสถานะไม่สำเร็จ" };
  }
}

async function isProjectMember(projectId: string, userId: string) {
  const member = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } });
  return !!member;
}

/** Any project member (or an admin) can attach a file — reference images,
 *  PDFs, or 3D/CAD exports left for the team, not gated behind "can manage
 *  this project" like status/member changes are. */
export async function uploadProjectFile(projectId: string, formData: FormData) {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "กรุณาเข้าสู่ระบบก่อน" };

    const isAdmin = session.user.role === "ADMIN";
    if (!isAdmin && !(await isProjectMember(projectId, session.user.id))) {
      return { success: false, error: "Unauthorized" };
    }

    const rateLimit = await checkRateLimit(`uploadProjectFile:${session.user.id}`, { maxAttempts: 20, windowMs: 60_000 });
    if (!rateLimit.allowed) {
      return { success: false, error: `แนบไฟล์ถี่เกินไป กรุณารออีก ${rateLimit.retryAfterSeconds} วินาที` };
    }

    const file = formData.get("file") as File | null;
    if (!file || !file.name || file.size === 0) {
      return { success: false, error: "กรุณาเลือกไฟล์" };
    }

    const validation = validateProjectFile(file);
    if (!validation.valid) return { success: false, error: validation.error };

    const fileUrl = await saveUploadedFile(file, `projects/${projectId}`);

    const projectFile = await prisma.projectFile.create({
      data: {
        projectId,
        fileUrl,
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        fileSize: file.size,
        uploadedById: session.user.id,
      },
      include: { uploadedBy: { select: { id: true, username: true, fullName: true } } },
    });

    await createActivityLog("UPLOAD_PROJECT_FILE", `Uploaded ${file.name} to project ${projectId}`);

    revalidatePath(`/projects/${projectId}`);
    return { success: true, data: JSON.parse(JSON.stringify(projectFile)) };
  } catch (error) {
    logError("Error uploading project file:", error);
    return { success: false, error: "แนบไฟล์ไม่สำเร็จ" };
  }
}

/** Only the uploader or someone who can manage the project can remove a file. */
export async function deleteProjectFile(fileId: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };

    const file = await prisma.projectFile.findUnique({ where: { id: fileId } });
    if (!file) return { success: false, error: "ไม่พบไฟล์นี้" };

    const isUploader = file.uploadedById === session.user.id;
    if (!isUploader && !(await canManageProject(file.projectId, session.user.id, session.user.role))) {
      return { success: false, error: "Unauthorized" };
    }

    await deleteUploadedFile(file.fileUrl);
    await prisma.projectFile.delete({ where: { id: fileId } });

    revalidatePath(`/projects/${file.projectId}`);
    return { success: true };
  } catch (error) {
    logError("Error deleting project file:", error);
    return { success: false, error: "ลบไฟล์ไม่สำเร็จ" };
  }
}
