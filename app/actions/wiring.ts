"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { createActivityLog } from "./auth";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";

// --- Equipment Templates ---

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
    console.error("Error fetching templates:", error);
    return { success: false, error: "Failed to fetch templates" };
  }
}

interface PinInput {
  name: string;
  type: string;
  xPos: number;
  yPos: number;
}

export async function createEquipmentTemplate(formData: FormData) {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };

    const name = formData.get("name") as string;
    const description = formData.get("description") as string;
    const imageFile = formData.get("imageFile") as File;
    const pinsJson = formData.get("pins") as string; // Expecting JSON array of pins

    if (!name || !imageFile) return { success: false, error: "Missing required fields" };

    // Handle image upload
    let imageUrl = "";
    if (imageFile && imageFile.size > 0) {
      const bytes = await imageFile.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const uploadDir = join(process.cwd(), "public", "uploads", "templates");
      await mkdir(uploadDir, { recursive: true });
      const fileName = `${uuidv4()}-${imageFile.name.replace(/\s+/g, "-")}`;
      const path = join(uploadDir, fileName);
      await writeFile(path, buffer);
      imageUrl = `/uploads/templates/${fileName}`;
    }

    const pins: PinInput[] = pinsJson ? JSON.parse(pinsJson) : [];

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
    console.error("Error creating template:", error);
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
    console.error("Error fetching diagrams:", error);
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
    console.error("Error fetching diagram:", error);
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
    console.error("Error creating diagram:", error);
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
    console.error("Error saving diagram state:", error);
    return { success: false, error: "Failed to save diagram state" };
  }
}
