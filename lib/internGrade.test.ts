import { describe, expect, it } from "vitest";
import { gradeForDay } from "./internGrade";

const history = [
  { grade: "A+", effectiveFrom: "2026-09-01" },
  { grade: "A", effectiveFrom: "2026-08-21" },
];

describe("gradeForDay", () => {
  it("uses the latest change on or before the day", () => {
    expect(gradeForDay(history, "2026-08-31", null)).toBe("A");
    expect(gradeForDay(history, "2026-09-01", null)).toBe("A+");
    expect(gradeForDay(history, "2026-12-01", null)).toBe("A+");
  });
  it("uses the first change's grade for days before it", () => {
    expect(gradeForDay(history, "2026-08-01", null)).toBe("A");
  });
  it("falls back when there is no history", () => {
    expect(gradeForDay([], "2026-08-01", "B")).toBe("B");
    expect(gradeForDay([], "2026-08-01", null)).toBeNull();
  });
});
