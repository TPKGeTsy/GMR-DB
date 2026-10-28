import { describe, expect, it } from "vitest";
import { analyzeDxf, readDxfFileName } from "./dxf";

const pair = (code: number, value: string | number) => `${String(code).padStart(3, " ")}\n${value}\n`;

const line = (x1: number, y1: number, x2: number, y2: number, linetype = "Continuous") =>
  pair(0, "LINE") + pair(8, "0") + pair(6, linetype) + pair(10, x1) + pair(20, y1) + pair(30, 0) + pair(11, x2) + pair(21, y2) + pair(31, 0);

const arc = (cx: number, cy: number, r: number, a1: number, a2: number) =>
  pair(0, "ARC") + pair(8, "0") + pair(10, cx) + pair(20, cy) + pair(30, 0) + pair(40, r) + pair(50, a1) + pair(51, a2);

const circle = (cx: number, cy: number, r: number) => pair(0, "CIRCLE") + pair(8, "0") + pair(10, cx) + pair(20, cy) + pair(40, r);

function file(entities: string, insUnits = 4) {
  return (
    pair(0, "SECTION") + pair(2, "HEADER") + pair(9, "$INSUNITS") + pair(70, insUnits) + pair(0, "ENDSEC") +
    pair(0, "SECTION") + pair(2, "ENTITIES") + entities + pair(0, "ENDSEC") + pair(0, "EOF")
  );
}

// 100 x 50 plate with a Ø10 hole, a 4-wide slot (two arcs + two lines), and one bend line.
const plate =
  line(0, 0, 100, 0) + line(100, 0, 100, 50) + line(100, 50, 0, 50) + line(0, 50, 0, 0) +
  circle(20, 25, 5) +
  line(60, 20, 60, 30) + line(64, 30, 64, 20) + arc(62, 30, 2, 0, 180) + arc(62, 20, 2, 180, 0) +
  line(80, 0, 80, 50, "HIDDEN");

describe("analyzeDxf", () => {
  const a = analyzeDxf(file(plate))!;

  it("measures the outer contour", () => {
    expect(a.width).toBe(100);
    expect(a.height).toBe(50);
    expect(a.area).toBe(5000);
  });

  it("finds the hole and the slot with their sizes", () => {
    expect(a.features.map((f) => f.kind).sort()).toEqual(["hole", "slot"]);
    expect(a.features.find((f) => f.kind === "hole")!.size).toBe("Ø10");
    expect(a.features.find((f) => f.kind === "slot")!.size).toBe("4 × 14");
  });

  it("counts dashed lines as bends", () => {
    expect(a.bendCount).toBe(1);
  });

  it("orders the steps: inner features, then the outline, then the bends", () => {
    expect(a.steps.map((s) => s.kind)).toEqual(["hole", "slot", "outline", "bend"]);
    expect(a.steps.map((s) => s.step)).toEqual([1, 2, 3, 4]);
  });

  it("converts inches to millimetres", () => {
    const inch = analyzeDxf(file(line(0, 0, 1, 0) + line(1, 0, 1, 1) + line(1, 1, 0, 1) + line(0, 1, 0, 0), 1))!;
    expect(inch.width).toBe(25.4);
    expect(inch.units).toBe("inch");
  });

  it("returns null when nothing is closed", () => {
    expect(analyzeDxf(file(line(0, 0, 10, 0)))).toBeNull();
  });
});

describe("readDxfFileName", () => {
  it("reads the part name and the piece count", () => {
    expect(readDxfFileName("ANTBOT-A01-PRT-125-DOOR_LOCK_KEEPER_BRACKET_1_1PCS.DXF")).toEqual({
      name: "ANTBOT-A01-PRT-125-DOOR LOCK KEEPER BRACKET 1",
      quantity: 1,
    });
    expect(readDxfFileName("PLATE_A_4PCS.dxf").quantity).toBe(4);
    expect(readDxfFileName("plain.dxf")).toEqual({ name: "plain", quantity: 1 });
  });
});
