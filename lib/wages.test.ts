import { describe, it, expect } from "vitest";
import { buildDailyWages, countMealDays, type WageSettingsValues } from "./wages";

const SETTINGS: WageSettingsValues = {
  gradeARate: 300,
  gradeBRate: 250,
  gradeCRate: 150,
  outsideFlatRate: 300,
  gradeAOutsideAllowance: 50,
};

function ev(isoTime: string, location: "OFFICE" | "OUTSIDE" = "OFFICE") {
  return { location, createdAt: new Date(isoTime) };
}

describe("buildDailyWages", () => {
  it("pays a grade A onsite day at the base rate", () => {
    const rows = buildDailyWages([ev("2026-01-05T09:00:00")], "A", SETTINGS);
    expect(rows).toEqual([{ dateKey: "2026-01-05", wentOutside: false, rate: 300 }]);
  });

  it("pays grade B and C onsite days at their own (lower) base rate", () => {
    expect(buildDailyWages([ev("2026-01-05T09:00:00")], "B", SETTINGS)[0].rate).toBe(250);
    expect(buildDailyWages([ev("2026-01-05T09:00:00")], "C", SETTINGS)[0].rate).toBe(150);
  });

  it("adds the configurable allowance on top of grade A's rate on an outside day", () => {
    const rows = buildDailyWages([ev("2026-01-05T09:00:00", "OUTSIDE")], "A", SETTINGS);
    expect(rows[0]).toEqual({ dateKey: "2026-01-05", wentOutside: true, rate: 350 });
  });

  it("bumps grade B/C to the flat outside rate instead of adding an allowance", () => {
    const rowsB = buildDailyWages([ev("2026-01-05T09:00:00", "OUTSIDE")], "B", SETTINGS);
    const rowsC = buildDailyWages([ev("2026-01-05T09:00:00", "OUTSIDE")], "C", SETTINGS);
    expect(rowsB[0].rate).toBe(300);
    expect(rowsC[0].rate).toBe(300);
  });

  it("counts a day as an outside day if ANY check-in that day was OUTSIDE, even a later OFFICE one", () => {
    const rows = buildDailyWages(
      [ev("2026-01-05T09:00:00", "OUTSIDE"), ev("2026-01-05T13:00:00", "OFFICE")],
      "A",
      SETTINGS
    );
    expect(rows[0].wentOutside).toBe(true);
    expect(rows[0].rate).toBe(350);
  });

  it("pays the full flat day-rate for any check-in that day, no partial-day proration", () => {
    // A single IN with no OUT yet still counts as a full paid day.
    const rows = buildDailyWages([ev("2026-01-05T23:50:00")], "C", SETTINGS);
    expect(rows[0].rate).toBe(150);
  });

  it("returns one row per distinct calendar day, sorted ascending", () => {
    const rows = buildDailyWages(
      [ev("2026-01-06T09:00:00"), ev("2026-01-05T09:00:00"), ev("2026-01-05T17:00:00")],
      "A",
      SETTINGS
    );
    expect(rows.map((r) => r.dateKey)).toEqual(["2026-01-05", "2026-01-06"]);
  });

  it("returns nothing for an empty check-in list", () => {
    expect(buildDailyWages([], "A", SETTINGS)).toEqual([]);
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
