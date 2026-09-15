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

const ALLOWED_PROJECT_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);
// Browsers generally don't have a built-in MIME sniff for CAD/3D formats —
// .step/.stl/.obj/.iges commonly show up as "" or "application/octet-stream"
// regardless of actual content — so these are matched by extension instead.
const ALLOWED_PROJECT_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png", "webp", "gif", "step", "stp", "stl", "obj", "iges", "igs"]);
export const MAX_PROJECT_FILE_BYTES = 50 * 1024 * 1024; // 50MB — CAD/3D files run much larger than photos

export interface NamedFileMeta extends FileMeta {
  name: string;
}

/** Validates a project attachment: images, PDFs, and common 3D/CAD exchange
 *  formats. Passes if either the MIME type or the file extension is on the
 *  allow-list, since MIME detection alone is unreliable for CAD formats. */
export function validateProjectFile(file: NamedFileMeta): { valid: true } | { valid: false; error: string } {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (!ALLOWED_PROJECT_MIME_TYPES.has(file.type) && !ALLOWED_PROJECT_EXTENSIONS.has(ext)) {
    return { valid: false, error: "รองรับเฉพาะไฟล์รูปภาพ, PDF, หรือไฟล์ 3D/CAD (STEP, STL, OBJ, IGES) เท่านั้น" };
  }
  if (file.size > MAX_PROJECT_FILE_BYTES) {
    return { valid: false, error: `ขนาดไฟล์ต้องไม่เกิน ${MAX_PROJECT_FILE_BYTES / (1024 * 1024)}MB` };
  }
  return { valid: true };
}
