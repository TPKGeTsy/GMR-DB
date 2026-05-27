"use server";

import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import { createActivityLog } from "./auth";

export async function getAssets(query?: string) {
  try {
    const assets = await prisma.asset.findMany({
      where: query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { modelOrSize: { contains: query, mode: "insensitive" } },
              { category: { contains: query, mode: "insensitive" } },
            ],
          }
        : {},
      orderBy: {
        createdAt: "desc",
      },
    });

    // Sanitize data for Client Components (Plain JSON only)
    const sanitizedAssets = JSON.parse(JSON.stringify(assets));

    return { success: true, data: sanitizedAssets };
  } catch (error) {
    console.error("Error fetching assets:", error);
    return { success: false, error: "Failed to fetch assets" };
  }
}

export async function getAssetById(id: string) {
  try {
    const asset = await prisma.asset.findUnique({
      where: { id },
    });

    if (!asset) {
      return { success: false, error: "Asset not found" };
    }

    return { success: true, data: JSON.parse(JSON.stringify(asset)) };
  } catch (error) {
    console.error("Error fetching asset by id:", error);
    return { success: false, error: "Failed to fetch asset" };
  }
}

export async function getAssetSuggestions() {
  try {
    const assets = await prisma.asset.findMany({
      select: {
        name: true,
        category: true,
        modelOrSize: true,
        unit: true,
      },
    });

    const suggestions = {
      names: Array.from(new Set(assets.map((a: { name: string }) => a.name))).filter(Boolean),
      categories: Array.from(new Set(assets.map((a: { category: string | null }) => a.category))).filter(Boolean),
      models: Array.from(new Set(assets.map((a: { modelOrSize: string }) => a.modelOrSize))).filter(Boolean),
      units: Array.from(new Set(assets.map((a: { unit: string }) => a.unit))).filter(Boolean),
    };

    return { success: true, data: suggestions };
  } catch (error) {
    console.error("Error fetching suggestions:", error);
    return { success: false, error: "Failed to fetch suggestions" };
  }
}

export async function createAsset(formData: FormData) {
  try {
    const name = formData.get("name") as string;
    const category = formData.get("category") as string || null;
    const modelOrSize = formData.get("modelOrSize") as string;
    const quantity = parseInt(formData.get("quantity") as string);
    const unit = formData.get("unit") as string;
    const categoryStatus = formData.get("categoryStatus") as string;
    const unitPrice = parseFloat(formData.get("unitPrice") as string);
    const imagePosition = formData.get("imagePosition") as string || "50% 50%";
    
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

    if (!name || !modelOrSize || isNaN(quantity) || !unit || !categoryStatus || isNaN(unitPrice)) {
      return { success: false, error: "Missing or invalid fields" };
    }

    const asset = await prisma.asset.create({
      data: {
        name,
        category,
        modelOrSize,
        quantity,
        unit,
        categoryStatus,
        unitPrice,
        imageUrl,
        imagePosition,
      },
    });

    await createActivityLog("CREATE_ASSET", `Created asset ${name} (${modelOrSize})`);

    const sanitizedAsset = JSON.parse(JSON.stringify(asset));

    revalidatePath("/inventory");
    revalidatePath("/dashboard");
    return { success: true, data: sanitizedAsset };
  } catch (error) {
    console.error("Error creating asset:", error);
    return { success: false, error: "Failed to create asset" };
  }
}

export async function updateAsset(id: string, formData: FormData) {
  try {
    const name = formData.get("name") as string;
    const category = formData.get("category") as string || null;
    const modelOrSize = formData.get("modelOrSize") as string;
    const quantity = parseInt(formData.get("quantity") as string);
    const unit = formData.get("unit") as string;
    const categoryStatus = formData.get("categoryStatus") as string;
    const unitPrice = parseFloat(formData.get("unitPrice") as string);
    const imagePosition = formData.get("imagePosition") as string;
    
    let imageUrl: string | undefined = undefined;
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

    if (!name || !modelOrSize || isNaN(quantity) || !unit || !categoryStatus || isNaN(unitPrice)) {
      return { success: false, error: "Missing or invalid fields" };
    }

    const asset = await prisma.asset.update({
      where: { id },
      data: {
        name,
        category,
        modelOrSize,
        quantity,
        unit,
        categoryStatus,
        unitPrice,
        ...(imageUrl && { imageUrl }),
        ...(imagePosition && { imagePosition }),
      },
    });

    await createActivityLog("UPDATE_ASSET", `Updated asset ${name} (${modelOrSize})`);

    revalidatePath("/inventory");
    revalidatePath("/dashboard");
    return { success: true, data: JSON.parse(JSON.stringify(asset)) };
  } catch (error) {
    console.error("Error updating asset:", error);
    return { success: false, error: "Failed to update asset" };
  }
}

export async function updateAssetQuantity(id: string, quantity: number) {
  try {
    if (isNaN(quantity) || quantity < 0) {
      return { success: false, error: "Invalid quantity" };
    }

    const asset = await prisma.asset.update({
      where: { id },
      data: { quantity },
    });

    await createActivityLog("UPDATE_QUANTITY", `Updated quantity of ${asset.name} to ${quantity}`);

    revalidatePath("/inventory");
    revalidatePath("/dashboard");
    return { success: true, data: JSON.parse(JSON.stringify(asset)) };
  } catch (error) {
    console.error("Error updating quantity:", error);
    return { success: false, error: "Failed to update quantity" };
  }
}

export async function updateAssetStatus(id: string, status: string) {
  try {
    const asset = await prisma.asset.update({
      where: { id },
      data: { categoryStatus: status },
    });

    await createActivityLog("UPDATE_STATUS", `Updated status of ${asset.name} to ${status}`);

    revalidatePath("/inventory");
    revalidatePath("/dashboard");
    return { success: true, data: JSON.parse(JSON.stringify(asset)) };
  } catch (error) {
    console.error("Error updating status:", error);
    return { success: false, error: "Failed to update status" };
  }
}

export async function deleteAsset(id: string) {
  try {
    const asset = await prisma.asset.delete({
      where: { id },
    });

    await createActivityLog("DELETE_ASSET", `Deleted asset ${asset.name}`);

    revalidatePath("/inventory");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Error deleting asset:", error);
    return { success: false, error: "Failed to delete asset" };
  }
}
export async function getDashboardStats() {
  try {
    const assets = await prisma.asset.findMany();

    const totalBudgetSpent = assets.reduce((total, asset) => {
      return total + (Number(asset.unitPrice) * asset.quantity);
    }, 0);

    const statsByCategory = assets.reduce((acc, asset) => {
      const status = asset.categoryStatus;
      const amount = Number(asset.unitPrice) * asset.quantity;
      
      if (!acc[status]) {
        acc[status] = { status, totalValue: 0, count: 0 };
      }
      acc[status].totalValue += amount;
      acc[status].count += 1;
      return acc;
    }, {} as Record<string, { status: string; totalValue: number; count: number }>);

    return {
      success: true,
      data: {
        totalBudgetSpent,
        chartData: Object.values(statsByCategory),
      },
    };
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    return { success: false, error: "Failed to fetch dashboard stats" };
  }
}

export async function getCatalogAssets({ 
  page = 1, 
  limit = 12, 
  query = "" 
}: { 
  page?: number; 
  limit?: number; 
  query?: string 
}) {
  try {
    const skip = (page - 1) * limit;
    
    const where: Prisma.AssetWhereInput = query ? {
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { modelOrSize: { contains: query, mode: "insensitive" } },
        { category: { contains: query, mode: "insensitive" } },
      ],
    } : {};

    const [assets, totalCount] = await Promise.all([
      prisma.asset.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.asset.count({ where }),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    return {
      success: true,
      data: {
        assets: JSON.parse(JSON.stringify(assets)),
        totalPages,
        currentPage: page,
        totalCount,
      },
    };
  } catch (error) {
    console.error("Error fetching catalog assets:", error);
    return { success: false, error: "Failed to fetch catalog assets" };
  }
}
