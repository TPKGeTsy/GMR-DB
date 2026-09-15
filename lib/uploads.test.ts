import { describe, it, expect } from "vitest";
import { validateImageFile, validateProjectFile, MAX_IMAGE_BYTES, MAX_PROJECT_FILE_BYTES } from "./uploads";

describe("validateImageFile", () => {
  it("accepts a normal-sized JPEG", () => {
    expect(validateImageFile({ type: "image/jpeg", size: 2 * 1024 * 1024 }).valid).toBe(true);
  });

  it("rejects a disallowed MIME type (e.g. a PDF or executable)", () => {
    const result = validateImageFile({ type: "application/pdf", size: 1000 });
    expect(result.valid).toBe(false);
  });

  it("rejects a file over the size cap", () => {
    const result = validateImageFile({ type: "image/png", size: MAX_IMAGE_BYTES + 1 });
    expect(result.valid).toBe(false);
  });

  it("accepts a file exactly at the size cap", () => {
    expect(validateImageFile({ type: "image/png", size: MAX_IMAGE_BYTES }).valid).toBe(true);
  });
});

describe("validateProjectFile", () => {
  it("accepts a PDF by MIME type", () => {
    expect(validateProjectFile({ type: "application/pdf", size: 1000, name: "drawing.pdf" }).valid).toBe(true);
  });

  it("accepts an image by MIME type", () => {
    expect(validateProjectFile({ type: "image/jpeg", size: 1000, name: "site.jpg" }).valid).toBe(true);
  });

  it("accepts a STEP file even though browsers report no useful MIME type for it", () => {
    expect(validateProjectFile({ type: "", size: 1000, name: "bracket.step" }).valid).toBe(true);
    expect(validateProjectFile({ type: "application/octet-stream", size: 1000, name: "bracket.stp" }).valid).toBe(true);
  });

  it("accepts other common 3D/CAD extensions", () => {
    for (const ext of ["stl", "obj", "iges", "igs"]) {
      expect(validateProjectFile({ type: "", size: 1000, name: `part.${ext}` }).valid).toBe(true);
    }
  });

  it("rejects a disallowed type/extension (e.g. an executable)", () => {
    const result = validateProjectFile({ type: "application/x-msdownload", size: 1000, name: "setup.exe" });
    expect(result.valid).toBe(false);
  });

  it("rejects a file over the size cap", () => {
    const result = validateProjectFile({ type: "application/pdf", size: MAX_PROJECT_FILE_BYTES + 1, name: "big.pdf" });
    expect(result.valid).toBe(false);
  });

  it("accepts a file exactly at the size cap", () => {
    expect(validateProjectFile({ type: "application/pdf", size: MAX_PROJECT_FILE_BYTES, name: "max.pdf" }).valid).toBe(true);
  });
});
