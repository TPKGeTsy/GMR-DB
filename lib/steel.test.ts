import { describe, expect, it } from "vitest";
import { parseBomLines, parsePartsCsv, planCuts, profileKey, profileLabel } from "./steel";

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

  it("uses a own bar length for a kind of steel when given", () => {
    const parts = [{ ...box, cutLength: 2500, quantity: 4 }];
    const standard = planCuts(parts, [], { kerf: 0, newBarLength: 6000 });
    const own = planCuts(parts, [], { kerf: 0, newBarLength: 6000, barLengths: { [profileKey(box)]: 10000 } });
    expect(standard.profiles[0].toBuy).toBe(2);
    expect(own.profiles[0].toBuy).toBe(1);
    expect(own.profiles[0].newBarLength).toBe(10000);
  });

  it("labels round bars without a y", () => {
    expect(profileLabel({ steelType: "ROUND", sectionX: 20, sectionY: null })).toBe("เหล็กกลม Ø20");
  });
});

describe("parsePartsCsv", () => {
  it("reads rows, skips header and blanks, reports bad rows", () => {
    const { parts, errors } = parsePartsCsv("type,x,y,z,qty\nST,50,25,1200,4\n\nเหล็กแบน;50;6;800;2\nST,50,,1000,1\nXYZ,1,1,1,1");
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatchObject({ steelType: "ST", sectionX: 50, sectionY: 25, cutLength: 1200, quantity: 4 });
    expect(parts[1].steelType).toBe("FLAT");
    expect(errors).toHaveLength(2);
  });
});

describe("parseBomLines (drawing bill of materials)", () => {
  const rb = [
    "8 7 6 5 4 3 2 1",
    "ITEM NO. QTY. DESCRIPTION LENGTH",
    "1 16 ST 75 x 75 x 2.3 1742",
    "F F",
    "2 2 RT 75 x 38 x 2.3 5121",
    "3 2 RT 75 x 38 x 2.3 3571",
    "5 19 ST 50 x 50 x2.3 238",
    "6 7 ST 50 x 50 x2.3 875",
    "8 8 ST 50 x 50 x2.3 1742",
    "E E",
    "11 6 ST 50 x 50 x2.3 1325",
    "13 16",
    "24 1 Sheet",
    "B B",
    "8 7 6 5 4 3 2 1",
  ];

  it("keeps complete steel rows, skips the rest", () => {
    const { parts, skipped } = parseBomLines(rb);
    expect(parts).toHaveLength(7);
    expect(parts[0]).toMatchObject({ steelType: "ST", sectionX: 50, sectionY: 50, thickness: 2.3, cutLength: 1742, quantity: 8 });
    expect(skipped.map((s) => s.line)).toEqual(["13 16", "24 1 Sheet"]);
  });

  it("sorts same steel together, then longest cut first", () => {
    const { parts } = parseBomLines(rb);
    expect(parts.map((p) => `${p.sectionX}x${p.sectionY}:${p.cutLength}`)).toEqual([
      "50x50:1742",
      "50x50:1325",
      "50x50:875",
      "50x50:238",
      "75x75:1742",
      "75x38:5121",
      "75x38:3571",
    ]);
  });

  it("reads the long TUBE, SQUARE form and ignores frame letters", () => {
    const { parts, skipped } = parseBomLines([
      "1 2 TUBE, SQUARE 49.00 X 49.00 X 2.30 1710",
      "E 4 1 Sheet E",
      "5 2",
      "SCALE:1:20 SHEET 1 OF 1",
    ]);
    expect(parts).toEqual([{ steelType: "ST", sectionX: 49, sectionY: 49, thickness: 2.3, cutLength: 1710, quantity: 2 }]);
    expect(skipped).toHaveLength(2);
  });

  it("keeps ST and RT apart", () => {
    const { parts } = parseBomLines(["1 1 ST 50 x 50 x 2.3 100", "2 1 RT 75 x 38 x 2.3 100", "3 1 TUBE 40 x 20 x 1.6 100"]);
    expect(parts.map((p) => p.steelType).sort()).toEqual(["RT", "RT", "ST"]);
  });

  it("adds up identical rows", () => {
    const { parts } = parseBomLines(["1 2 ST 50 x 50 x 2.3 1000", "2 3 ST 50 x 50 x 2.3 1000"]);
    expect(parts).toHaveLength(1);
    expect(parts[0].quantity).toBe(5);
  });
});
