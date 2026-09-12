"use server";

import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { auth } from "@/auth";
import { createActivityLog } from "./auth";
import { revalidatePath } from "next/cache";
import { validateImageFile } from "@/lib/uploads";
import { saveUploadedFile } from "@/lib/storage";
import { z } from "zod";

const vehicleFormSchema = z.object({
  name: z.string().trim().min(1, "กรุณากรอกชื่อรถ"),
  licensePlate: z.string().trim().min(1, "กรุณากรอกทะเบียนรถ"),
});

export async function getVehicles() {
  try {
    const vehicles = await prisma.vehicle.findMany({
      orderBy: { createdAt: "desc" },
    });
    return { success: true, data: JSON.parse(JSON.stringify(vehicles)) };
  } catch (error) {
    logError("Error fetching vehicles:", error);
    return { success: false, error: "Failed to fetch vehicles" };
  }
}

export async function createVehicle(formData: FormData) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN" && session?.user?.role !== "OPERATOR") {
      return { success: false, error: "Unauthorized" };
    }

    const parsed = vehicleFormSchema.safeParse({
      name: formData.get("name"),
      licensePlate: formData.get("licensePlate"),
    });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message || "ข้อมูลไม่ถูกต้อง" };
    }
    const { name, licensePlate } = parsed.data;

    let imageUrl: string | null = null;
    const imageFile = formData.get("imageFile") as File;

    if (imageFile && imageFile.name && imageFile.size > 0) {
      const validation = validateImageFile(imageFile);
      if (!validation.valid) return { success: false, error: validation.error };
      imageUrl = await saveUploadedFile(imageFile, "vehicles");
    }

    const vehicle = await prisma.vehicle.create({
      data: { name, licensePlate, imageUrl },
    });

    await createActivityLog("CREATE_VEHICLE", `Added vehicle ${name} (${licensePlate})`);

    revalidatePath("/carbook");
    return { success: true, data: JSON.parse(JSON.stringify(vehicle)) };
  } catch (error) {
    logError("Error creating vehicle:", error);
    return { success: false, error: "Failed to create vehicle" };
  }
}

export async function updateVehicleStatus(vehicleId: string, status: "AVAILABLE" | "MAINTENANCE") {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN" && session?.user?.role !== "OPERATOR") {
      return { success: false, error: "Unauthorized" };
    }

    const vehicle = await prisma.vehicle.update({
      where: { id: vehicleId },
      data: { status },
    });

    await createActivityLog("UPDATE_VEHICLE_STATUS", `Set ${vehicle.name} to ${status}`);

    revalidatePath("/carbook");
    return { success: true };
  } catch (error) {
    logError("Error updating vehicle status:", error);
    return { success: false, error: "Failed to update vehicle status" };
  }
}
