import { describe, expect, it } from "vitest";
import { cutSequence, planSheetJob } from "./cutSequence";
import type { Placed } from "./nesting";

const placed = (id: string, copy: number, x: number, y: number, w = 100, h = 100): Placed => ({ id, name: id, copy, x, y, w, h, rotated: false });

describe("cutSequence", () => {
  it("goes from the corner to the nearest part each time", () => {
    const steps = cutSequence(
      [placed("far", 1, 900, 900), placed("mid", 1, 400, 0), placed("near", 1, 0, 0)],
      () => []
    );
    expect(steps.map((s) => s.partId)).toEqual(["near", "mid", "far"]);
    expect(steps.map((s) => s.step)).toEqual([1, 2, 3]);
  });

  it("sums the holes of a part by size, the most common first", () => {
    const [step] = cutSequence([placed("TP", 1, 0, 0)], () => [{ size: "Ø22" }, { size: "Ø18" }, { size: "Ø22" }, { size: "Ø22" }]);
    expect(step.holes).toEqual([
      { size: "Ø22", count: 3 },
      { size: "Ø18", count: 1 },
    ]);
    expect(step.holeTotal).toBe(4);
  });

  it("gives every copy its own step", () => {
    const steps = cutSequence([placed("A", 1, 0, 0), placed("A", 2, 200, 0), placed("A", 3, 400, 0)], () => []);
    expect(steps.map((s) => s.copy)).toEqual([1, 2, 3]);
  });
});

describe("planSheetJob", () => {
  const part = (id: string, thickness: number | null, quantity: number) => ({ id, name: id, width: 1000, height: 1000, thickness, quantity });

  it("keeps thicknesses apart and counts equal sheets together", () => {
    const groups = planSheetJob([part("a", 10, 13), part("b", 6, 1)], { sheetWidth: 2000, sheetHeight: 2000, gap: 0, allowRotate: true });
    expect(groups.map((g) => g.thickness)).toEqual([6, 10]);
    const ten = groups[1].results;
    expect(ten.reduce((n, r) => n + r.count, 0)).toBe(4); // 13 plates of 1000 x 1000 = 3 full sheets + 1
    expect(ten.map((r) => r.count).sort()).toEqual([1, 3]);
  });
});
