import { describe, expect, it } from "vitest";
import { parseBomTable, type TextPiece } from "./bomTable";
import { summarizeFasteners, fastenerOf } from "./bomImage";

const t = (str: string, x: number, y: number, width = 50): TextPiece => ({ str, x, y, width });

// Positions taken from a real SolidWorks parts list.
const page: TextPiece[] = [
  t("F", 46, 753.3, 7.3),
  t("ITEM NO.", 538.5, 749.1, 56.5),
  t("PART NUMBER", 679.2, 749.1, 88.3),
  t("DESCRIPTION", 907.6, 749.1, 83),
  t("QTY.", 1070.9, 749.1, 28.6),
  t("1", 563.1, 724.3, 7.3),
  t("RB1-RB2-CX2-CX1-For Powerhouse", 604.9, 724.3, 217),
  t("1", 1081.6, 724.3, 7.3),
  t("2", 563.1, 699.5, 7.3),
  t("L 50x50x5", 604.9, 699.5, 59),
  t("32", 1077.9, 699.5, 14.7),
  t("B18.22M - Plain washer, 12 mm,", 604.9, 674.7, 198),
  t("3", 563.1, 668.3, 7.3),
  t("128", 1074.2, 668.3, 22),
  t("narrow", 604.9, 661.8, 44.7),
  t("B18.2.3.1M - Hex cap screw, M12 x", 604.9, 633, 218),
  t("E", 45.6, 627.9, 8),
  t("4", 563.1, 626.6, 7.3),
  t("64", 1077.9, 626.6, 14.7),
  t("E", 1165.3, 627.9, 8),
  t("1.75 x 80 --30N", 604.9, 620.1, 91),
  t("B18.2.4.1M - Hex nut, Style 1, M12 x", 604.9, 588.8, 223),
  t("5", 563.1, 582.4, 7.3),
  t("64", 1077.9, 582.4, 14.7),
  t("1.75 --D-N", 604.9, 576, 62),
  t("10", 559.4, 540, 14.7),
  t("Door", 604.9, 540, 31),
  t("1", 1081.6, 540, 7.3),
  t("UNLESS OTHERWISE SPECIFIED:", 653.7, 176.9, 78),
];

describe("parseBomTable", () => {
  const rows = parseBomTable(page);

  it("joins wrapped lines and ignores the frame letters", () => {
    expect(rows.map((r) => r.item)).toEqual([1, 2, 3, 4, 5, 10]);
    expect(rows[2]).toMatchObject({ partNumber: "B18.22M - Plain washer, 12 mm, narrow", qty: 128 });
    expect(rows[3]).toMatchObject({ partNumber: "B18.2.3.1M - Hex cap screw, M12 x 1.75 x 80 --30N", qty: 64 });
  });

  it("finds nothing on a page without the header", () => {
    expect(parseBomTable(page.filter((p) => p.str !== "QTY."))).toEqual([]);
  });

  it("lets the fasteners be summed by exact size", () => {
    expect(fastenerOf(rows[1])).toBeNull();
    const total = summarizeFasteners([...rows, { item: 11, partNumber: rows[3].partNumber, description: "", qty: 6 }]);
    expect(total.find((f) => f.kind === "screw")).toMatchObject({ size: "M12", length: 80, quantity: 70 });
    expect(total.find((f) => f.kind === "washer")).toMatchObject({ size: "M12", quantity: 128 });
  });
});

describe("parseBomTable table end", () => {
  it("does not read the title block under the table as rows", () => {
    const rows = parseBomTable([...page, t("5", 563, 40, 7), t("TITLE BLOCK", 700, 40, 60), t("1", 1081, 40, 7)]);
    expect(rows.map((r) => r.item)).toEqual([1, 2, 3, 4, 5, 10]);
    expect(rows[5].partNumber).toBe("Door");
  });
});
