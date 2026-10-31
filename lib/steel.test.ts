import { describe, expect, it } from "vitest";
import { matchesSizeFilter, mergeParts, parseBomLines, parsePartsCsv, parseSizeFilter, planCuts, profileKey, profileLabel } from "./steel";

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

describe("several files added up", () => {
  const row = (file: string, qty: number, z = 1742) => ({
    steelType: "ST",
    sectionX: 75,
    sectionY: 75,
    thickness: 2.3,
    cutLength: z,
    quantity: qty,
    sources: [file],
  });

  it("adds the same steel and length across files and remembers the files", () => {
    const merged = mergeParts([row("1", 2), row("4", 2), row("6", 2)]);
    expect(merged).toHaveLength(1);
    expect(merged[0].quantity).toBe(6);
    expect(merged[0].sources).toEqual(["1", "4", "6"]);
  });

  it("keeps different lengths as separate rows", () => {
    expect(mergeParts([row("1", 2), row("4", 2, 900)])).toHaveLength(2);
  });
});

describe("size filter", () => {
  const st = { steelType: "ST", sectionX: 75, sectionY: 75, thickness: 2.3 };
  const rt = { steelType: "RT", sectionX: 75, sectionY: 38, thickness: 2.3 };

  it("no filter keeps everything", () => {
    expect(matchesSizeFilter(st, parseSizeFilter(""))).toBe(true);
  });

  it("matches x, y (either way round) and thickness when given", () => {
    const f = parseSizeFilter("75x75x2.3, 38*75");
    expect(matchesSizeFilter(st, f)).toBe(true);
    expect(matchesSizeFilter(rt, f)).toBe(true);
    expect(matchesSizeFilter({ ...st, thickness: 3 }, parseSizeFilter("75x75x2.3"))).toBe(false);
    expect(matchesSizeFilter({ ...st, sectionX: 50, sectionY: 50 }, parseSizeFilter("75x75"))).toBe(false);
  });
});

describe("parseBomLines with two tables on one drawing", () => {
  // Text of XS-63 Long-Set.pdf, line by line.
  const drawing = [
    "8 7 6 5 4 3 2 1",
    "ITEM NO. PART NUMBER DESCRIPTION QTY.",
    "ST 50 x 50 x 2.3 / L 50 x 50 x 4 L=",
    "1 1 XS-63 Long 1",
    "125.5 mm",
    "2 2L 50x4 L= 5 cm with M12-Bolt L 50 x 50 x 4 mm L= 50 mm 4",
    "9 8",
    "ITEM NO. QTY. DESCRIPTION LENGTH",
    "1 1 ST 50 x 50 x 2.3 1910",
    "2 2 ST 50 x 50 x 2.3 240.42",
    "3 2 ST 50 x 50 x 2.3 430 4",
    "4 2 ST 50 x 50 x 2.3 282.84",
    "7 1 ST 50 x 50 x 2.3 98",
    "9 8 L ANGLE 50 x 50 x 4 125.5",
    "DETAIL A",
    "SCALE 2 : 15",
    "A XS-63 LONG 3PCS A",
  ];

  it("reads only the cut list (ITEM NO. / QTY. / DESCRIPTION / LENGTH)", () => {
    const { parts, skipped } = parseBomLines(drawing);
    expect(parts).toHaveLength(6);
    expect(parts.some((p) => p.cutLength === 50)).toBe(false); // the assembly table's "L= 50 mm" is not read
    expect(skipped).toEqual([]);
  });

  it("takes the length right after the size, not a balloon number at the end of the line", () => {
    const { parts } = parseBomLines(drawing);
    const row3 = parts.find((p) => p.cutLength === 430);
    expect(row3).toMatchObject({ steelType: "ST", sectionX: 50, quantity: 2 });
    expect(parts.find((p) => p.cutLength === 125.5)).toMatchObject({ steelType: "ANGLE", sectionX: 50, sectionY: 50, thickness: 4, quantity: 8 });
  });

  it("reads H SECTION rows (height x width x kg/m)", () => {
    const { parts, skipped } = parseBomLines([
      "ITEM NO. QTY. DESCRIPTION LENGTH",
      "1 2 H SECTION 300 x 150 x 37 3650",
      "2 2 H SECTION 300 x 150 x 37 5183.5",
    ]);
    expect(skipped).toEqual([]);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatchObject({ steelType: "HBEAM", sectionX: 300, sectionY: 150, thickness: 37, quantity: 2 });
    expect(parts.map((p) => p.cutLength).sort((a, b) => a - b)).toEqual([3650, 5183.5]);
  });

  it("reads channels, I and T sections, rebars and square bars", () => {
    const { parts, skipped } = parseBomLines([
      "ITEM NO. QTY. DESCRIPTION LENGTH",
      "1 2 C 100 x 50 x 20 x 2.3 1500",
      "2 1 I SECTION 200 x 100 x 21 3000",
      "3 4 T SECTION 50 x 50 x 5 800",
      "4 6 DB 16 1200",
      "5 3 SQUARE BAR 16 x 16 700",
    ]);
    expect(skipped).toEqual([]);
    expect(parts.map((p) => [p.steelType, p.sectionX, p.sectionY, p.thickness, p.cutLength, p.quantity]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))).toEqual([
      ["CHANNEL", 100, 50, 2.3, 1500, 2],
      ["IBEAM", 200, 100, 21, 3000, 1],
      ["REBAR", 16, null, null, 1200, 6],
      ["SQBAR", 16, null, null, 700, 3],
      ["TEE", 50, 50, 5, 800, 4],
    ]);
  });

  it("still reads plain rows when there is no table header at all", () => {
    expect(parseBomLines(["1 16 ST 75 x 75 x 2.3 1742"]).parts).toHaveLength(1);
  });
});

describe("planCuts stock ids", () => {
  it("tells which stock bar a cut came from", () => {
    const box = { steelType: "ST", sectionX: 50, sectionY: 50, thickness: 2.3 };
    const plan = planCuts(
      [{ ...box, cutLength: 900, quantity: 1 }],
      [
        { ...box, id: "short", length: 500, quantity: 1 },
        { ...box, id: "fits", length: 1000, quantity: 1 },
        { ...box, id: "long", length: 3000, quantity: 1 },
      ],
      { kerf: 0, newBarLength: 6000 }
    );
    expect(plan.profiles[0].bars).toHaveLength(1);
    expect(plan.profiles[0].bars[0]).toMatchObject({ source: "stock", stockId: "fits", length: 1000 });
  });
});

describe("taught words", () => {
  const row = ["1 2 UPN 100 x 50 x 5 1200"];
  it("skips an unknown steel word, then reads it once it was taught", () => {
    expect(parseBomLines(row).parts).toEqual([]);
    expect(parseBomLines(row).skipped).toHaveLength(1);
    const taught = parseBomLines(row, [{ keyword: "upn", steelType: "CHANNEL" }]);
    expect(taught.skipped).toEqual([]);
    expect(taught.parts[0]).toMatchObject({ steelType: "CHANNEL", sectionX: 100, sectionY: 50, thickness: 5, cutLength: 1200, quantity: 2 });
  });
});
