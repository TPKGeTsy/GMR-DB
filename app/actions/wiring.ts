"use server";

import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { createActivityLog } from "./auth";
import { validateImageFile } from "@/lib/uploads";
import { saveUploadedFile } from "@/lib/storage";
import { checkRateLimit } from "@/lib/rateLimit";
import { z } from "zod";

// --- Equipment Templates ---

const pinSchema = z.object({
  name: z.string().trim().min(1, "กรุณาตั้งชื่อพิน"),
  type: z.string().trim().min(1, "กรุณาเลือกประเภทพิน"),
  xPos: z.number().min(0).max(100, "ตำแหน่งต้องอยู่ระหว่าง 0-100%"),
  yPos: z.number().min(0).max(100, "ตำแหน่งต้องอยู่ระหว่าง 0-100%"),
});

const equipmentTemplateSchema = z.object({
  name: z.string().trim().min(1, "กรุณากรอกชื่ออุปกรณ์"),
  description: z.string().trim().optional(),
  pins: z.array(pinSchema).default([]),
});

export async function getEquipmentTemplates() {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const templates = await prisma.equipmentTemplate.findMany({
      include: { pins: true },
      orderBy: { createdAt: "desc" },
    });

    return { success: true, data: JSON.parse(JSON.stringify(templates)) };
  } catch (error) {
    logError("Error fetching templates:", error);
    return { success: false, error: "Failed to fetch templates" };
  }
}

export async function createEquipmentTemplate(formData: FormData) {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };

    const imageFile = formData.get("imageFile") as File;
    if (!imageFile || imageFile.size === 0) {
      return { success: false, error: "กรุณาอัปโหลดรูปอุปกรณ์" };
    }

    const pinsJson = formData.get("pins") as string | null; // Expecting JSON array of pins
    let pinsRaw: unknown = [];
    if (pinsJson) {
      try {
        pinsRaw = JSON.parse(pinsJson);
      } catch {
        return { success: false, error: "ข้อมูลพินไม่ถูกต้อง" };
      }
    }

    const parsed = equipmentTemplateSchema.safeParse({
      name: formData.get("name"),
      description: (formData.get("description") as string | null) || undefined,
      pins: pinsRaw,
    });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message || "ข้อมูลไม่ถูกต้อง" };
    }
    const { name, description, pins } = parsed.data;

    const validation = validateImageFile(imageFile);
    if (!validation.valid) return { success: false, error: validation.error };
    const imageUrl = await saveUploadedFile(imageFile, "templates");

    const template = await prisma.equipmentTemplate.create({
      data: {
        name,
        description,
        imageUrl,
        ownerId: session.user.id,
        pins: {
          create: pins.map((p) => ({
            name: p.name,
            type: p.type,
            xPos: p.xPos,
            yPos: p.yPos,
          })),
        },
      },
    });

    await createActivityLog("CREATE_TEMPLATE", `Created equipment template ${name}`);
    revalidatePath("/templates");
    return { success: true, data: JSON.parse(JSON.stringify(template)) };
  } catch (error) {
    logError("Error creating template:", error);
    return { success: false, error: "Failed to create template" };
  }
}

// --- Wiring Diagrams ---

export async function getWiringDiagrams() {
  try {
    const diagrams = await prisma.wiringDiagram.findMany({
      include: { owner: { select: { username: true } } },
      orderBy: { createdAt: "desc" },
    });
    return { success: true, data: JSON.parse(JSON.stringify(diagrams)) };
  } catch (error) {
    logError("Error fetching diagrams:", error);
    return { success: false, error: "Failed to fetch diagrams" };
  }
}

export async function getWiringDiagramById(id: string) {
  try {
    const diagram = await prisma.wiringDiagram.findUnique({
      where: { id },
      include: {
        equipments: {
          include: {
            template: {
              include: { pins: true }
            }
          }
        },
        wires: true,
      },
    });

    if (!diagram) return { success: false, error: "Diagram not found" };

    return { success: true, data: JSON.parse(JSON.stringify(diagram)) };
  } catch (error) {
    logError("Error fetching diagram:", error);
    return { success: false, error: "Failed to fetch diagram" };
  }
}

export async function createWiringDiagram(name: string, description?: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };

    const diagram = await prisma.wiringDiagram.create({
      data: {
        name,
        description,
        ownerId: session.user.id,
      },
    });

    await createActivityLog("CREATE_DIAGRAM", `Created wiring diagram ${name}`);
    revalidatePath("/diagrams");
    return { success: true, data: JSON.parse(JSON.stringify(diagram)) };
  } catch (error) {
    logError("Error creating diagram:", error);
    return { success: false, error: "Failed to create diagram" };
  }
}

interface EquipmentInstanceInput {
  id: string;
  templateId: string;
  xPos: number;
  yPos: number;
}

interface WireConnectionInput {
  sourceInstanceId: string;
  sourcePinId: string;
  targetInstanceId: string;
  targetPinId: string;
  wireType: string;
}

export async function saveDiagramState(id: string, state: { 
  equipments: EquipmentInstanceInput[], 
  wires: WireConnectionInput[] 
}) {
  try {
    const session = await auth();
    const diagram = await prisma.wiringDiagram.findUnique({ where: { id } });
    
    if (!diagram) return { success: false, error: "Diagram not found" };
    if (diagram.ownerId !== session?.user?.id) return { success: false, error: "Unauthorized" };

    // Transaction to update the diagram state
    await prisma.$transaction(async (tx) => {
      // 1. Clear existing instances and wires (Cascade delete handles wires)
      await tx.equipmentInstance.deleteMany({ where: { diagramId: id } });

      // 2. Re-create instances
      for (const eq of state.equipments) {
        await tx.equipmentInstance.create({
          data: {
            id: eq.id, // Keep the same ID if possible or map them
            diagramId: id,
            templateId: eq.templateId,
            xPos: eq.xPos,
            yPos: eq.yPos,
          }
        });

        // 3. Re-create wires for this instance (if they are source)
        const instanceWires = state.wires.filter(w => w.sourceInstanceId === eq.id);
        if (instanceWires.length > 0) {
          await tx.wireConnection.createMany({
            data: instanceWires.map(w => ({
              diagramId: id,
              sourceInstanceId: w.sourceInstanceId,
              sourcePinId: w.sourcePinId,
              targetInstanceId: w.targetInstanceId,
              targetPinId: w.targetPinId,
              wireType: w.wireType
            }))
          });
        }
      }
    });

    revalidatePath(`/diagrams/${id}`);
    return { success: true };
  } catch (error) {
    logError("Error saving diagram state:", error);
    return { success: false, error: "Failed to save diagram state" };
  }
}

// --- Circuit Sandbox (free-form, saved as a raw React Flow snapshot) ---

interface SandboxCanvasData {
  nodes: unknown[];
  edges: unknown[];
}

export async function createSandboxDiagram(name: string, canvasData: SandboxCanvasData, projectId?: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };
    if (!name.trim()) return { success: false, error: "กรุณาตั้งชื่อวงจร" };

    const rateLimit = await checkRateLimit(`createSandboxDiagram:${session.user.id}`, { maxAttempts: 20, windowMs: 60_000 });
    if (!rateLimit.allowed) {
      return { success: false, error: `สร้างวงจรถี่เกินไป กรุณารออีก ${rateLimit.retryAfterSeconds} วินาที` };
    }

    let linkProjectId: string | undefined;
    if (projectId) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: { members: { where: { userId: session.user.id } } },
      });
      const canAttach = !!project && (
        session.user.role === "ADMIN" ||
        project.createdById === session.user.id ||
        project.members.length > 0
      );
      if (canAttach) linkProjectId = projectId;
    }

    const diagram = await prisma.wiringDiagram.create({
      data: {
        name: name.trim(),
        ownerId: session.user.id,
        kind: "SANDBOX",
        canvasData: canvasData as unknown as Prisma.InputJsonValue,
        projectId: linkProjectId,
      },
    });

    await createActivityLog("CREATE_DIAGRAM", `Created circuit sandbox "${name.trim()}"`);
    revalidatePath("/diagrams");
    if (linkProjectId) revalidatePath(`/projects/${linkProjectId}`);
    return { success: true, data: { id: diagram.id } };
  } catch (error) {
    logError("Error creating sandbox diagram:", error);
    return { success: false, error: "Failed to save circuit" };
  }
}

export async function updateSandboxDiagram(id: string, name: string, canvasData: SandboxCanvasData) {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };
    if (!name.trim()) return { success: false, error: "กรุณาตั้งชื่อวงจร" };

    const diagram = await prisma.wiringDiagram.findUnique({ where: { id } });
    if (!diagram) return { success: false, error: "Diagram not found" };
    const canEdit = diagram.ownerId === session.user.id || session.user.role === "ADMIN";
    if (!canEdit) return { success: false, error: "Unauthorized" };
    if (diagram.kind !== "SANDBOX") return { success: false, error: "Invalid diagram type" };

    await prisma.wiringDiagram.update({
      where: { id },
      data: { name: name.trim(), canvasData: canvasData as unknown as Prisma.InputJsonValue },
    });

    revalidatePath(`/diagrams/${id}`);
    revalidatePath("/diagrams");
    return { success: true };
  } catch (error) {
    logError("Error updating sandbox diagram:", error);
    return { success: false, error: "Failed to save circuit" };
  }
}

export async function deleteSandboxDiagram(id: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };

    const diagram = await prisma.wiringDiagram.findUnique({ where: { id } });
    if (!diagram) return { success: false, error: "Diagram not found" };
    const canDelete = diagram.ownerId === session.user.id || session.user.role === "ADMIN";
    if (!canDelete) return { success: false, error: "Unauthorized" };

    await prisma.wiringDiagram.delete({ where: { id } });

    await createActivityLog("DELETE_DIAGRAM", `Deleted circuit sandbox "${diagram.name}"`);
    revalidatePath("/diagrams");
    if (diagram.projectId) revalidatePath(`/projects/${diagram.projectId}`);
    return { success: true };
  } catch (error) {
    logError("Error deleting sandbox diagram:", error);
    return { success: false, error: "Failed to delete circuit" };
  }
}

// --- Project <-> Circuit linking ---

export async function getSandboxDiagramsForProject(projectId: string) {
  try {
    const diagrams = await prisma.wiringDiagram.findMany({
      where: { projectId, kind: "SANDBOX" },
      include: { owner: { select: { username: true } } },
      orderBy: { createdAt: "desc" },
    });
    return { success: true, data: JSON.parse(JSON.stringify(diagrams)) };
  } catch (error) {
    logError("Error fetching project circuits:", error);
    return { success: false, error: "Failed to fetch circuits" };
  }
}

export async function getUnlinkedSandboxDiagrams() {
  try {
    const diagrams = await prisma.wiringDiagram.findMany({
      where: { projectId: null, kind: "SANDBOX" },
      include: { owner: { select: { username: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return { success: true, data: JSON.parse(JSON.stringify(diagrams)) };
  } catch (error) {
    logError("Error fetching unlinked circuits:", error);
    return { success: false, error: "Failed to fetch circuits" };
  }
}

async function canManageProject(projectId: string, userId: string, role?: string | null) {
  if (role === "ADMIN") return true;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  return !!project && project.createdById === userId;
}

export async function linkSandboxDiagramToProject(diagramId: string, projectId: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };

    const allowed = await canManageProject(projectId, session.user.id, session.user.role);
    if (!allowed) return { success: false, error: "Unauthorized" };

    const diagram = await prisma.wiringDiagram.findUnique({ where: { id: diagramId } });
    if (!diagram || diagram.kind !== "SANDBOX") return { success: false, error: "Circuit not found" };

    await prisma.wiringDiagram.update({ where: { id: diagramId }, data: { projectId } });

    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/diagrams");
    return { success: true };
  } catch (error) {
    logError("Error linking circuit to project:", error);
    return { success: false, error: "Failed to link circuit" };
  }
}

export async function unlinkSandboxDiagramFromProject(diagramId: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };

    const diagram = await prisma.wiringDiagram.findUnique({ where: { id: diagramId } });
    if (!diagram || !diagram.projectId) return { success: false, error: "Circuit not found" };

    const allowed =
      diagram.ownerId === session.user.id ||
      (await canManageProject(diagram.projectId, session.user.id, session.user.role));
    if (!allowed) return { success: false, error: "Unauthorized" };

    const projectId = diagram.projectId;
    await prisma.wiringDiagram.update({ where: { id: diagramId }, data: { projectId: null } });

    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/diagrams");
    return { success: true };
  } catch (error) {
    logError("Error unlinking circuit from project:", error);
    return { success: false, error: "Failed to unlink circuit" };
  }
}
