const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB — comfortably above a typical phone photo (2-5MB)

export interface FileMeta {
  type: string;
  size: number;
}

/** Validates an uploaded image's MIME type and size before it's ever written to storage. */
export function validateImageFile(file: FileMeta): { valid: true } | { valid: false; error: string } {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return { valid: false, error: "รองรับเฉพาะไฟล์รูปภาพ (JPEG, PNG, WEBP, GIF) เท่านั้น" };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { valid: false, error: `ขนาดไฟล์ต้องไม่เกิน ${MAX_IMAGE_BYTES / (1024 * 1024)}MB` };
  }
  return { valid: true };
}
