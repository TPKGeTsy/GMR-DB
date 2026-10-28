import { describe, expect, it } from "vitest";
import { angleFromRow, bomChunkPrompt, classifyBomRow, fastenerOf, fixPartNumber, parseBomPipeLines, summarizeFasteners, type BomRow } from "./bomImage";

const row = (partNumber: string, qty: number, description = ""): BomRow => ({ item: null, partNumber, description, qty });

describe("parseBomPipeLines", () => {
  it("reads the lines, repairs B18 part numbers and notices END", () => {
    const reply = [
      "3|M18.22M - Plain washer, 20 mm, narrow||122",
      "5|818.2.3.1M - Hex cap screw, M20 x 2.5 x 60 -60N||161",
      "19|LP-1|L 100x100x10 L = 200 mm|28",
      "END",
    ].join("\n");
    const { rows, ended } = parseBomPipeLines(reply);
    expect(ended).toBe(true);
    expect(rows).toHaveLength(3);
    expect(rows[0].partNumber.startsWith("B18.22M")).toBe(true);
    expect(rows[1].partNumber.startsWith("B18.2.3.1M")).toBe(true);
    expect(rows[2]).toMatchObject({ item: 19, partNumber: "LP-1", description: "L 100x100x10 L = 200 mm", qty: 28 });
  });

  it("drops a line that was cut off and rows without a number", () => {
    const { rows, ended } = parseBomPipeLines("```\n1|Beam||1\n2|CS_10|Detail A-1|abc\n3|Part|desc\n4|Half|De");
    expect(ended).toBe(false);
    expect(rows.map((r) => r.item)).toEqual([1]);
  });

  it("puts the starting item into the prompt", () => {
    expect(bomChunkPrompt(30)).toContain("greater than 30");
  });
});

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

describe("fixPartNumber", () => {
  it("only touches the B18 prefix", () => {
    expect(fixPartNumber("818.2.4.1M - Hex nut")).toBe("B18.2.4.1M - Hex nut");
    expect(fixPartNumber("CS_18.5")).toBe("CS_18.5");
  });
});
