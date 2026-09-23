import { describe, it, expect } from "vitest";
import { buildDailyWages, countMealDays, type WageGradeRate } from "./wages";

const GRADE_A: WageGradeRate = { code: "A", onsiteRate: 300, outsideRate: 350 };
const GRADE_B: WageGradeRate = { code: "B", onsiteRate: 250, outsideRate: 300 };

function ev(isoTime: string, location: "OFFICE" | "OUTSIDE" = "OFFICE") {
  return { location, createdAt: new Date(isoTime) };
}

describe("buildDailyWages", () => {
  it("pays the onsite rate for a day with only OFFICE check-ins", () => {
    const rows = buildDailyWages([ev("2026-01-05T09:00:00")], GRADE_A);
    expect(rows).toEqual([{ dateKey: "2026-01-05", wentOutside: false, rate: 300 }]);
  });

  it("pays the outside rate for a day with an OUTSIDE check-in", () => {
    const rows = buildDailyWages([ev("2026-01-05T09:00:00", "OUTSIDE")], GRADE_A);
    expect(rows[0]).toEqual({ dateKey: "2026-01-05", wentOutside: true, rate: 350 });
  });

  it("uses each grade's own independently-set rates, no shared formula", () => {
    const rowsA = buildDailyWages([ev("2026-01-05T09:00:00", "OUTSIDE")], GRADE_A);
    const rowsB = buildDailyWages([ev("2026-01-05T09:00:00", "OUTSIDE")], GRADE_B);
    expect(rowsA[0].rate).toBe(350);
    expect(rowsB[0].rate).toBe(300);
  });

  it("counts a day as an outside day if ANY check-in that day was OUTSIDE, even a later OFFICE one", () => {
    const rows = buildDailyWages(
      [ev("2026-01-05T09:00:00", "OUTSIDE"), ev("2026-01-05T13:00:00", "OFFICE")],
      GRADE_A
    );
    expect(rows[0].wentOutside).toBe(true);
    expect(rows[0].rate).toBe(350);
  });

  it("pays the full flat day-rate for any check-in that day, no partial-day proration", () => {
    // A single IN with no OUT yet still counts as a full paid day.
    const rows = buildDailyWages([ev("2026-01-05T23:50:00")], GRADE_B);
    expect(rows[0].rate).toBe(250);
  });

  it("returns one row per distinct calendar day, sorted ascending", () => {
    const rows = buildDailyWages(
      [ev("2026-01-06T09:00:00"), ev("2026-01-05T09:00:00"), ev("2026-01-05T17:00:00")],
      GRADE_A
    );
    expect(rows.map((r) => r.dateKey)).toEqual(["2026-01-05", "2026-01-06"]);
  });

  it("returns nothing for an empty check-in list", () => {
    expect(buildDailyWages([], GRADE_A)).toEqual([]);
  });
});

describe("countMealDays", () => {
  it("counts zero when nobody went outside", () => {
    expect(countMealDays([ev("2026-01-05T09:00:00", "OFFICE")])).toBe(0);
  });

  it("counts one meal per distinct day with an OUTSIDE check-in, not per event", () => {
    const days = countMealDays([
      ev("2026-01-05T09:00:00", "OUTSIDE"),
      ev("2026-01-05T17:00:00", "OUTSIDE"), // same day, shouldn't double-count
      ev("2026-01-06T09:00:00", "OUTSIDE"),
    ]);
    expect(days).toBe(2);
  });
});
