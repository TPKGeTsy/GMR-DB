import { describe, it, expect } from "vitest";
import { validateImageFile, MAX_IMAGE_BYTES } from "./uploads";

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
