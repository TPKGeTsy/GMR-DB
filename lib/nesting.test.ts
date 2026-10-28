import { describe, expect, it } from "vitest";
import { groupIdenticalSheets, loopArea, nest, shapeOnSheet, shapesOnSheet, type Placed } from "./nesting";

const item = (id: string, width: number, height: number) => ({ id, name: id, width, height });
const opts = { sheetWidth: 2000, sheetHeight: 2000, gap: 0, allowRotate: true };

function overlaps(a: Placed, b: Placed, gap: number) {
  return a.x < b.x + b.w + gap - 1e-6 && b.x < a.x + a.w + gap - 1e-6 && a.y < b.y + b.h + gap - 1e-6 && b.y < a.y + a.h + gap - 1e-6;
}

describe("nest", () => {
  it("fits four 1000 x 1000 parts on one 2000 x 2000 sheet", () => {
    const r = nest([{ item: item("A", 1000, 1000), quantity: 4 }], opts);
    expect(r.sheets).toHaveLength(1);
    expect(r.sheets[0].placed).toHaveLength(4);
  });

  it("needs a second sheet for the fifth part", () => {
    const r = nest([{ item: item("A", 1000, 1000), quantity: 5 }], opts);
    expect(r.sheets).toHaveLength(2);
  });

  it("turns a part when that is the only way to fit", () => {
    const r = nest([{ item: item("long", 2400, 500), quantity: 1 }], { sheetWidth: 1219, sheetHeight: 2438, gap: 0, allowRotate: true });
    expect(r.sheets).toHaveLength(1);
    expect(r.sheets[0].placed[0].rotated).toBe(true);
    expect(r.sheets[0].placed[0].w).toBe(500);
    const fixed = nest([{ item: item("long", 2400, 500), quantity: 1 }], { sheetWidth: 1219, sheetHeight: 2438, gap: 0, allowRotate: false });
    expect(fixed.tooBig).toEqual(["long"]);
  });

  it("reports parts larger than the sheet", () => {
    const r = nest([{ item: item("huge", 3000, 3000), quantity: 2 }], opts);
    expect(r.tooBig).toEqual(["huge"]);
    expect(r.sheets).toHaveLength(0);
  });

  it("keeps the gap between parts and stays inside the sheet", () => {
    const gap = 5;
    const r = nest(
      [
        { item: item("A", 300, 200), quantity: 12 },
        { item: item("B", 450, 120), quantity: 9 },
        { item: item("C", 160.4, 832.6), quantity: 7 },
      ],
      { sheetWidth: 1219, sheetHeight: 2438, gap, allowRotate: true }
    );
    for (const sheet of r.sheets) {
      for (const p of sheet.placed) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.x + p.w).toBeLessThanOrEqual(1219 + 1e-6);
        expect(p.y + p.h).toBeLessThanOrEqual(2438 + 1e-6);
      }
      for (let i = 0; i < sheet.placed.length; i++) {
        for (let j = i + 1; j < sheet.placed.length; j++) expect(overlaps(sheet.placed[i], sheet.placed[j], gap)).toBe(false);
      }
    }
    expect(r.sheets.reduce((n, s) => n + s.placed.length, 0)).toBe(28);
  });
});

describe("geometry helpers", () => {
  it("measures a polygon", () => {
    expect(loopArea([[0, 0], [10, 0], [10, 5], [0, 5]])).toBe(50);
  });

  it("keeps a hole inside the outline when the part is turned", () => {
    const outer: [number, number][] = [[0, 0], [40, 0], [40, 10], [0, 10]];
    const hole: [number, number][] = [[5, 4], [8, 4], [8, 6], [5, 6]];
    const [o, h] = shapesOnSheet([outer, hole], true);
    expect(Math.max(...o.map((p) => p[0]))).toBe(10);
    expect(Math.max(...o.map((p) => p[1]))).toBe(40);
    expect(h.every(([x, y]) => x >= 0 && x <= 10 && y >= 0 && y <= 40)).toBe(true);
  });

  it("moves a shape to the origin and turns it", () => {
    const tri: [number, number][] = [[10, 10], [30, 10], [10, 15]];
    expect(shapeOnSheet(tri, false)).toEqual([[0, 0], [20, 0], [0, 5]]);
    const turned = shapeOnSheet(tri, true);
    expect(Math.max(...turned.map((p) => p[0]))).toBe(5);
    expect(Math.max(...turned.map((p) => p[1]))).toBe(20);
  });
});

describe("identical layouts", () => {
  it("counts equal sheets together", () => {
    // Four 1000 x 1000 parts fill a 2000 x 2000 sheet exactly: 3 full sheets + 1 with a single part.
    const r = nest([{ item: item("A", 1000, 1000), quantity: 13 }], opts);
    const groups = groupIdenticalSheets(r.sheets, { sheetWidth: 2000, sheetHeight: 2000, thickness: 3 });
    expect(r.sheets).toHaveLength(4);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.count).sort()).toEqual([1, 3]);
    expect(new Set(groups.map((g) => g.signature)).size).toBe(2);
  });

  it("gives the same signature for the same layout and a different one for another thickness", () => {
    const r = nest([{ item: item("A", 1000, 1000), quantity: 4 }], opts);
    const a = groupIdenticalSheets(r.sheets, { sheetWidth: 2000, sheetHeight: 2000, thickness: 3 })[0].signature;
    const b = groupIdenticalSheets(r.sheets, { sheetWidth: 2000, sheetHeight: 2000, thickness: 3 })[0].signature;
    const c = groupIdenticalSheets(r.sheets, { sheetWidth: 2000, sheetHeight: 2000, thickness: 6 })[0].signature;
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
