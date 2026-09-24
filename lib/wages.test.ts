import { describe, it, expect } from "vitest";
import { buildDailyWages, countMealDays, type WageGradeRate, type WageCheckInEvent } from "./wages";

const GRADE_A: WageGradeRate = { code: "A", onsiteRate: 300, outsideRate: 350 };
const GRADE_B: WageGradeRate = { code: "B", onsiteRate: 250, outsideRate: 300 };

function ev(
  type: "IN" | "OUT",
  isoTime: string,
  location: "OFFICE" | "OUTSIDE" = "OFFICE",
  note?: string
): WageCheckInEvent {
  return { type, location, createdAt: new Date(isoTime), note };
}

describe("buildDailyWages", () => {
  it("pays just the flat onsite rate for a normal day with no OT", () => {
    const rows = buildDailyWages([ev("IN", "2026-01-05T09:00:00"), ev("OUT", "2026-01-05T17:00:00")], GRADE_A);
    expect(rows).toEqual([{ dateKey: "2026-01-05", wentOutside: false, otHours: 0, baseRate: 300, otPay: 0, rate: 300, note: null }]);
  });

  it("uses the outside rate as the day's base rate when any check-in that day was OUTSIDE", () => {
    const rows = buildDailyWages([ev("IN", "2026-01-05T09:00:00", "OUTSIDE"), ev("OUT", "2026-01-05T17:00:00")], GRADE_A);
    expect(rows[0].wentOutside).toBe(true);
    expect(rows[0].baseRate).toBe(350);
  });

  it("adds OT pay at 1.5x the day's own hourly rate (dayRate/8) on top of the base rate", () => {
    // 09:00-19:00 = 10h elapsed, >8h so -1h lunch = 9h total = 1.0h OT.
    // Grade A onsite: hourly = 300/8 = 37.5, OT pay = 37.5*1.5*1.0 = 56.25 -> rounds to 56.
    const rows = buildDailyWages([ev("IN", "2026-01-05T09:00:00"), ev("OUT", "2026-01-05T19:00:00")], GRADE_A);
    expect(rows[0].otHours).toBeCloseTo(1, 5);
    expect(rows[0].baseRate).toBe(300);
    expect(rows[0].otPay).toBe(56);
    expect(rows[0].rate).toBe(356);
  });

  it("computes the OT hourly rate from the day's OWN rate (outside vs onsite), not a fixed rate", () => {
    // Same 1.0h OT day, but worked OUTSIDE: hourly = grade.outsideRate/8, not onsiteRate/8.
    const rows = buildDailyWages([ev("IN", "2026-01-05T09:00:00", "OUTSIDE"), ev("OUT", "2026-01-05T19:00:00")], GRADE_A);
    // outsideRate 350/8=43.75, *1.5=65.625*1.0h -> rounds to 66
    expect(rows[0].baseRate).toBe(350);
    expect(rows[0].otPay).toBe(66);
    expect(rows[0].rate).toBe(416);
  });

  it("uses each grade's own independently-set rates for both base and OT", () => {
    const rowsA = buildDailyWages([ev("IN", "2026-01-05T09:00:00"), ev("OUT", "2026-01-05T20:00:00")], GRADE_A);
    const rowsB = buildDailyWages([ev("IN", "2026-01-05T09:00:00"), ev("OUT", "2026-01-05T20:00:00")], GRADE_B);
    expect(rowsA[0].rate).not.toBe(rowsB[0].rate);
  });

  it("pays the full flat day-rate for any check-in that day, no partial-day proration", () => {
    // A single IN with no OUT yet still counts as a full paid day, no OT.
    const rows = buildDailyWages([ev("IN", "2026-01-05T23:50:00")], GRADE_B);
    expect(rows[0]).toEqual({ dateKey: "2026-01-05", wentOutside: false, otHours: 0, baseRate: 250, otPay: 0, rate: 250, note: null });
  });

  it("returns one row per distinct calendar day, sorted ascending", () => {
    const rows = buildDailyWages(
      [
        ev("IN", "2026-01-06T09:00:00"),
        ev("OUT", "2026-01-06T17:00:00"),
        ev("IN", "2026-01-05T09:00:00"),
        ev("OUT", "2026-01-05T17:00:00"),
      ],
      GRADE_A
    );
    expect(rows.map((r) => r.dateKey)).toEqual(["2026-01-05", "2026-01-06"]);
  });

  it("attributes an overnight OT session (crossing midnight) to the day it started, base + OT included", () => {
    const rows = buildDailyWages(
      [ev("IN", "2026-01-05T13:00:00"), ev("OUT", "2026-01-06T07:00:00")], // 18h elapsed, -1h lunch = 17h -> 9h OT
      GRADE_A
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].dateKey).toBe("2026-01-05");
    expect(rows[0].otHours).toBeCloseTo(9, 5);
    expect(rows[0].otPay).toBe(Math.round(9 * (300 / 8) * 1.5));
  });

  it("returns nothing for an empty check-in list", () => {
    expect(buildDailyWages([], GRADE_A)).toEqual([]);
  });

  it("surfaces an OUTSIDE check-in's note as-is when it has no admin-edit prefix", () => {
    const rows = buildDailyWages(
      [ev("IN", "2026-01-05T09:00:00", "OUTSIDE", "ไซต์งาน ABC"), ev("OUT", "2026-01-05T17:00:00", "OUTSIDE")],
      GRADE_A
    );
    expect(rows[0].note).toBe("ไซต์งาน ABC");
  });

  it("strips the manual-entry note down to just the location after the ออกหน้างาน marker", () => {
    const rows = buildDailyWages(
      [ev("IN", "2026-01-05T09:00:00", "OUTSIDE", "แก้ไขโดยแอดมิน: 8.0 ชม. — ออกหน้างาน: Aisin")],
      GRADE_A
    );
    expect(rows[0].note).toBe("Aisin");
  });

  it("has no note for a day with no OUTSIDE check-in", () => {
    const rows = buildDailyWages([ev("IN", "2026-01-05T09:00:00"), ev("OUT", "2026-01-05T17:00:00")], GRADE_A);
    expect(rows[0].note).toBeNull();
  });
});

describe("countMealDays", () => {
  it("counts zero when nobody went outside", () => {
    expect(countMealDays([{ location: "OFFICE", createdAt: new Date("2026-01-05T09:00:00") }])).toBe(0);
  });

  it("counts one meal per distinct day with an OUTSIDE check-in, not per event", () => {
    const days = countMealDays([
      { location: "OUTSIDE", createdAt: new Date("2026-01-05T09:00:00") },
      { location: "OUTSIDE", createdAt: new Date("2026-01-05T17:00:00") }, // same day, shouldn't double-count
      { location: "OUTSIDE", createdAt: new Date("2026-01-06T09:00:00") },
    ]);
    expect(days).toBe(2);
  });

  it("excludes a day once every OUTSIDE check-in on it has mealCounted turned off", () => {
    const days = countMealDays([
      { location: "OUTSIDE", createdAt: new Date("2026-01-05T09:00:00"), mealCounted: false },
      { location: "OUTSIDE", createdAt: new Date("2026-01-05T17:00:00"), mealCounted: false },
    ]);
    expect(days).toBe(0);
  });

  it("still counts a day if ANY of its OUTSIDE check-ins has mealCounted on (or unset)", () => {
    const days = countMealDays([
      { location: "OUTSIDE", createdAt: new Date("2026-01-05T09:00:00"), mealCounted: false },
      { location: "OUTSIDE", createdAt: new Date("2026-01-05T17:00:00") }, // unset -> defaults true
    ]);
    expect(days).toBe(1);
  });
});
