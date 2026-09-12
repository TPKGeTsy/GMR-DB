"use server";

import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { createActivityLog } from "./auth";
import { validateImageFile } from "@/lib/uploads";
import { saveUploadedFile } from "@/lib/storage";
import { z } from "zod";

const assetFormSchema = z.object({
  name: z.string().trim().min(1, "กรุณากรอกชื่ออุปกรณ์"),
  category: z.string().trim().optional(),
  modelOrSize: z.string().trim().min(1, "กรุณากรอกรุ่น/ขนาด"),
  quantity: z.coerce.number().int("จำนวนต้องเป็นเลขจำนวนเต็ม").min(0, "จำนวนต้องไม่ติดลบ"),
  unit: z.string().trim().min(1, "กรุณากรอกหน่วย"),
  categoryStatus: z.enum(["R", "Y", "G", "B"], { message: "สถานะไม่ถูกต้อง" }),
  unitPrice: z.coerce.number().min(0, "ราคาต้องไม่ติดลบ"),
  imagePosition: z.string().trim().optional(),
});

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
    logError("Error fetching assets:", error);
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
    logError("Error fetching asset by id:", error);
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
    logError("Error fetching suggestions:", error);
    return { success: false, error: "Failed to fetch suggestions" };
  }
}

export async function createAsset(formData: FormData) {
  try {
    const parsed = assetFormSchema.safeParse({
      name: formData.get("name"),
      category: (formData.get("category") as string | null) || undefined,
      modelOrSize: formData.get("modelOrSize"),
      quantity: formData.get("quantity"),
      unit: formData.get("unit"),
      categoryStatus: formData.get("categoryStatus"),
      unitPrice: formData.get("unitPrice"),
      imagePosition: (formData.get("imagePosition") as string | null) || undefined,
    });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message || "ข้อมูลไม่ถูกต้อง" };
    }
    const { name, category, modelOrSize, quantity, unit, categoryStatus, unitPrice, imagePosition } = parsed.data;

    let imageUrl: string | null = null;
    const imageFile = formData.get("imageFile") as File;

    if (imageFile && imageFile.name && imageFile.size > 0) {
      const validation = validateImageFile(imageFile);
      if (!validation.valid) return { success: false, error: validation.error };
      imageUrl = await saveUploadedFile(imageFile, "assets");
    }

    const asset = await prisma.asset.create({
      data: {
        name,
        category: category || null,
        modelOrSize,
        quantity,
        unit,
        categoryStatus,
        unitPrice,
        imageUrl,
        imagePosition: imagePosition || "50% 50%",
      },
    });

    await createActivityLog("CREATE_ASSET", `Created asset ${name} (${modelOrSize})`);

    const sanitizedAsset = JSON.parse(JSON.stringify(asset));

    revalidatePath("/inventory");
    revalidatePath("/dashboard");
    return { success: true, data: sanitizedAsset };
  } catch (error) {
    logError("Error creating asset:", error);
    return { success: false, error: "Failed to create asset" };
  }
}

export async function updateAsset(id: string, formData: FormData) {
  try {
    const parsed = assetFormSchema.safeParse({
      name: formData.get("name"),
      category: (formData.get("category") as string | null) || undefined,
      modelOrSize: formData.get("modelOrSize"),
      quantity: formData.get("quantity"),
      unit: formData.get("unit"),
      categoryStatus: formData.get("categoryStatus"),
      unitPrice: formData.get("unitPrice"),
      imagePosition: (formData.get("imagePosition") as string | null) || undefined,
    });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message || "ข้อมูลไม่ถูกต้อง" };
    }
    const { name, category, modelOrSize, quantity, unit, categoryStatus, unitPrice, imagePosition } = parsed.data;

    let imageUrl: string | undefined = undefined;
    const imageFile = formData.get("imageFile") as File;

    if (imageFile && imageFile.name && imageFile.size > 0) {
      const validation = validateImageFile(imageFile);
      if (!validation.valid) return { success: false, error: validation.error };
      imageUrl = await saveUploadedFile(imageFile, "assets");
    }

    const asset = await prisma.asset.update({
      where: { id },
      data: {
        name,
        category: category || null,
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
    logError("Error updating asset:", error);
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
    logError("Error updating quantity:", error);
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
    logError("Error updating status:", error);
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
    logError("Error deleting asset:", error);
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
    logError("Error fetching dashboard stats:", error);
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
    logError("Error fetching catalog assets:", error);
    return { success: false, error: "Failed to fetch catalog assets" };
  }
}
