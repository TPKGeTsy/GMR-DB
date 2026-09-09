"use server";

import prisma from "@/lib/prisma";
import { auth } from "@/auth";
import { createActivityLog } from "./auth";
import { revalidatePath } from "next/cache";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";

export async function getVehicles() {
  try {
    const vehicles = await prisma.vehicle.findMany({
      orderBy: { createdAt: "desc" },
    });
    return { success: true, data: JSON.parse(JSON.stringify(vehicles)) };
  } catch (error) {
    console.error("Error fetching vehicles:", error);
    return { success: false, error: "Failed to fetch vehicles" };
  }
}

export async function createVehicle(formData: FormData) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN" && session?.user?.role !== "OPERATOR") {
      return { success: false, error: "Unauthorized" };
    }

    const name = formData.get("name") as string;
    const licensePlate = formData.get("licensePlate") as string;

    if (!name || !licensePlate) {
      return { success: false, error: "Missing required fields" };
    }

    let imageUrl: string | null = null;
    const imageFile = formData.get("imageFile") as File;

    if (imageFile && imageFile.name && imageFile.size > 0) {
      const bytes = await imageFile.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const uploadDir = join(process.cwd(), "public", "uploads");
      await mkdir(uploadDir, { recursive: true });

      const fileName = `${uuidv4()}-${imageFile.name.replace(/\s+/g, "-")}`;
      const path = join(uploadDir, fileName);
      await writeFile(path, buffer);
      imageUrl = `/uploads/${fileName}`;
    }

    const vehicle = await prisma.vehicle.create({
      data: { name, licensePlate, imageUrl },
    });

    await createActivityLog("CREATE_VEHICLE", `Added vehicle ${name} (${licensePlate})`);

    revalidatePath("/carbook");
    return { success: true, data: JSON.parse(JSON.stringify(vehicle)) };
  } catch (error) {
    console.error("Error creating vehicle:", error);
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
    console.error("Error updating vehicle status:", error);
    return { success: false, error: "Failed to update vehicle status" };
  }
}
