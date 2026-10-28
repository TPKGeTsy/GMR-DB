import { describe, expect, it } from "vitest";
import { angleFromRow, classifyBomRow, fastenerOf, summarizeFasteners, type BomRow } from "./bomImage";

const row = (partNumber: string, qty: number, description = ""): BomRow => ({ item: null, partNumber, description, qty });

describe("fasteners", () => {
  it("classifies the rows", () => {
    expect(classifyBomRow(row("B18.22M - Plain washer, 16 mm, narrow", 1))).toBe("washer");
    expect(classifyBomRow(row("B18.2.4.1M - Hex nut, Style 1, M16 x 2 --D-N", 1))).toBe("nut");
    expect(classifyBomRow(row("B18.2.3.1M - Hex cap screw, M16 x 2.0 x 60 --60N", 1))).toBe("screw");
    expect(classifyBomRow(row("TP1", 4, "DETAIL A: TP1 PLATE, T=10 mm"))).toBe("plate");
    expect(classifyBomRow(row("LP-1", 28, "L 100x100x10 L = 200 mm"))).toBe("steel");
    expect(classifyBomRow(row("CS_10", 1, "Detail A-1"))).toBe("other");
  });

  it("reads size and screw length", () => {
    expect(fastenerOf(row("B18.2.3.1M - Hex cap screw, M20 x 2.5 x 60 -60N", 1))).toEqual({ kind: "screw", size: "M20", length: 60 });
    expect(fastenerOf(row("B18.22M - Plain washer, 20 mm, narrow", 1))).toEqual({ kind: "washer", size: "M20", length: null });
    expect(fastenerOf(row("B18.2.4.1M - Hex nut, Style 1, M12 x 1.75 --D-N", 1))).toEqual({ kind: "nut", size: "M12", length: null });
  });

  it("totals per kind, size and length", () => {
    const totals = summarizeFasteners([
      row("B18.2.3.1M - Hex cap screw, M16 x 2.0 x 60 -60N", 270),
      row("B18.2.3.1M - Hex cap screw, M16 x 2.0 x 60 -60N", 30),
      row("B18.2.3.1M - Hex cap screw, M16 x 2.0 x 55 -55N", 284),
      row("B18.2.4.1M - Hex nut, Style 1, M16 x 2 --D-N", 684),
      row("B18.22M - Plain washer, 16 mm, narrow", 1368),
    ]);
    expect(totals.find((t) => t.kind === "screw" && t.length === 60)!.quantity).toBe(300);
    expect(totals).toHaveLength(4);
  });
});

describe("angleFromRow", () => {
  it("reads an angle to cut", () => {
    expect(angleFromRow(row("LP-1", 28, "L 100x100x10 L = 200 mm"))).toEqual({
      steelType: "ANGLE",
      sectionX: 100,
      sectionY: 100,
      thickness: 10,
      cutLength: 200,
      quantity: 28,
    });
  });

  it("ignores rows without a length", () => {
    expect(angleFromRow(row("Door", 1))).toBeNull();
  });
});
