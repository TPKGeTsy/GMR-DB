import { describe, expect, it } from "vitest";
import { cleanOtReason, MAX_OT_REASON_LENGTH, shouldAskOtReason } from "./otReason";

describe("otReason", () => {
  it("asks only after 8 h 30 min", () => {
    expect(shouldAskOtReason(8)).toBe(false);
    expect(shouldAskOtReason(8.5)).toBe(false);
    expect(shouldAskOtReason(8.6)).toBe(true);
  });
  it("cleans the text", () => {
    expect(cleanOtReason("   ")).toBeNull();
    expect(cleanOtReason(undefined)).toBeNull();
    expect(cleanOtReason("  รอ  ลูกค้า \n ทดสอบ ")).toBe("รอ ลูกค้า ทดสอบ");
    expect(cleanOtReason("ก".repeat(500))!.length).toBe(MAX_OT_REASON_LENGTH);
  });
});
