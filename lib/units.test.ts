import { describe, expect, it } from "vitest";
import { formatLength, formatLengthWithUnit, formatSection, fromUnit, toUnit } from "./units";

describe("units", () => {
  it("converts both ways", () => {
    expect(toUnit(1910, "cm")).toBe(191);
    expect(toUnit(6000, "m")).toBe(6);
    expect(toUnit(25.4, "in")).toBe(1);
    expect(fromUnit(191, "cm")).toBe(1910);
    expect(fromUnit(2, "in")).toBeCloseTo(50.8);
  });

  it("formats with the digits each unit needs", () => {
    expect(formatLength(125.5, "mm")).toBe("125.5");
    expect(formatLength(125.5, "cm")).toBe("12.55");
    expect(formatLength(1910, "m")).toBe("1.91");
    expect(formatLengthWithUnit(1910, "mm")).toBe("1,910 มม.");
  });

  it("writes the section with a unit on every number", () => {
    expect(formatSection({ sectionX: 50, sectionY: 50, thickness: 4 }, "mm")).toBe("50 มม. × 50 มม. × 4 มม.");
    expect(formatSection({ sectionX: 75, sectionY: 38, thickness: null }, "cm")).toBe("7.5 ซม. × 3.8 ซม.");
    expect(formatSection({ sectionX: 20, sectionY: null }, "mm")).toBe("Ø20 มม.");
  });
});
