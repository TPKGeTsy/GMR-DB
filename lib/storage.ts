import { put, del } from "@vercel/blob";
import { randomUUID } from "crypto";
import { MAX_IMAGE_BYTES } from "@/lib/uploads";

/**
 * Uploads a file to Vercel Blob storage and returns its public URL.
 *
 * Vercel's serverless functions have an ephemeral filesystem — anything written
 * to disk (e.g. `public/uploads`) can vanish the next time the function cold-starts,
 * so all persistent file storage goes through Blob instead.
 */
export async function saveUploadedFile(file: File, folder: string): Promise<string> {
  const bytes = await file.arrayBuffer();
  const safeName = file.name.replace(/\s+/g, "-");
  const blob = await put(`${folder}/${safeName}`, Buffer.from(bytes), {
    access: "public",
    addRandomSuffix: true,
  });
  return blob.url;
}

const DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/;

/**
 * Uploads a base64 `data:image/...;base64,...` string (e.g. a webcam snapshot
 * captured client-side via `canvas.toDataURL()`) to Vercel Blob and returns its URL.
 */
export async function saveDataUrlImage(dataUrl: string, folder: string): Promise<string> {
  const match = dataUrl.match(DATA_URL_RE);
  if (!match) throw new Error("Invalid image data URL");

  const [, contentType, base64] = match;
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error(`ขนาดรูปต้องไม่เกิน ${MAX_IMAGE_BYTES / (1024 * 1024)}MB`);
  }

  const ext = contentType.split("/")[1];
  const blob = await put(`${folder}/${randomUUID()}.${ext}`, buffer, {
    access: "public",
    contentType,
  });
  return blob.url;
}

/** Deletes a previously uploaded file. Safe to call with a null/undefined url. */
export async function deleteUploadedFile(url?: string | null): Promise<void> {
  if (!url) return;
  try {
    await del(url);
  } catch {
    // Already gone or not a Blob URL (e.g. a legacy /uploads/* path) — nothing to do.
  }
}
