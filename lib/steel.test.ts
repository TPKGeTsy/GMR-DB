import { describe, expect, it } from "vitest";
import { parsePartsCsv, planCuts, profileLabel } from "./steel";

const box = { steelType: "BOX", sectionX: 50, sectionY: 25 };
const opts = { kerf: 0, newBarLength: 6000 };

describe("planCuts", () => {
  it("packs pieces into stock bars first, then buys new bars", () => {
    const plan = planCuts(
      [{ ...box, cutLength: 2000, quantity: 5 }],
      [{ ...box, length: 4000, quantity: 1 }],
      opts
    );
    const p = plan.profiles[0];
    expect(p.stockUsed).toBe(1);
    expect(p.toBuy).toBe(1); // 2 pieces in the 4000 bar, the other 3 fit one new 6000 bar
    expect(p.bars.filter((b) => b.source === "new").length).toBe(p.toBuy);
    expect(p.bars.flatMap((b) => b.cuts).length).toBe(5);
  });

  it("buys nothing when the stock covers everything", () => {
    const plan = planCuts(
      [{ ...box, cutLength: 1500, quantity: 4 }],
      [{ ...box, length: 6000, quantity: 1 }],
      opts
    );
    expect(plan.totalToBuy).toBe(0);
    expect(plan.profiles[0].bars[0].leftover).toBe(0);
  });

  it("charges kerf between pieces", () => {
    const parts = [{ ...box, cutLength: 3000, quantity: 2 }];
    const noKerf = planCuts(parts, [], { kerf: 0, newBarLength: 6000 });
    const withKerf = planCuts(parts, [], { kerf: 3, newBarLength: 6000 });
    expect(noKerf.profiles[0].toBuy).toBe(1);
    expect(withKerf.profiles[0].toBuy).toBe(2);
  });

  it("keeps different profiles apart", () => {
    const plan = planCuts(
      [
        { ...box, cutLength: 1000, quantity: 1 },
        { steelType: "FLAT", sectionX: 50, sectionY: 6, cutLength: 1000, quantity: 1 },
      ],
      [{ ...box, length: 6000, quantity: 1 }],
      opts
    );
    expect(plan.profiles).toHaveLength(2);
    expect(plan.totalToBuy).toBe(1); // only the FLAT one has no stock
  });

  it("reports pieces longer than any bar", () => {
    const plan = planCuts([{ ...box, cutLength: 7000, quantity: 1 }], [], opts);
    expect(plan.hasProblem).toBe(true);
    expect(plan.profiles[0].tooLong).toEqual([7000]);
  });

  it("uses the shortest stock bar that fits", () => {
    const plan = planCuts(
      [{ ...box, cutLength: 900, quantity: 1 }],
      [
        { ...box, length: 6000, quantity: 1 },
        { ...box, length: 1000, quantity: 1 },
      ],
      opts
    );
    expect(plan.profiles[0].bars[0].length).toBe(1000);
    expect(plan.profiles[0].stockUnused).toBe(1);
  });

  it("labels round bars without a y", () => {
    expect(profileLabel({ steelType: "ROUND", sectionX: 20, sectionY: null })).toBe("เหล็กกลม Ø20");
  });
});

describe("parsePartsCsv", () => {
  it("reads rows, skips header and blanks, reports bad rows", () => {
    const { parts, errors } = parsePartsCsv("type,x,y,z,qty\nBOX,50,25,1200,4\n\nเหล็กแบน;50;6;800;2\nBOX,50,,1000,1\nXYZ,1,1,1,1");
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatchObject({ steelType: "BOX", sectionX: 50, sectionY: 25, cutLength: 1200, quantity: 4 });
    expect(parts[1].steelType).toBe("FLAT");
    expect(errors).toHaveLength(2);
  });
});
