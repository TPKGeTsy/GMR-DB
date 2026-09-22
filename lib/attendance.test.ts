import { describe, it, expect } from "vitest";
import { buildDailySummary, type CheckInEvent } from "./attendance";

function ev(type: "IN" | "OUT", isoTime: string, location: "OFFICE" | "OUTSIDE" = "OFFICE"): CheckInEvent {
  return { type, location, createdAt: new Date(isoTime) };
}

describe("buildDailySummary", () => {
  it("returns nothing for an empty list", () => {
    expect(buildDailySummary([])).toEqual([]);
  });

  it("computes a simple day under 8 hours with no overtime", () => {
    const rows = buildDailySummary([
      ev("IN", "2026-01-05T09:00:00"),
      ev("OUT", "2026-01-05T17:00:00"),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].totalHours).toBeCloseTo(8, 5);
    expect(rows[0].regularHours).toBeCloseTo(8, 5);
    expect(rows[0].otHours).toBe(0);
    expect(rows[0].stillWorking).toBe(false);
  });

  it("splits anything past 8 hours into overtime, after subtracting the untracked lunch break", () => {
    const rows = buildDailySummary([
      ev("IN", "2026-01-05T08:00:00"),
      ev("OUT", "2026-01-05T19:00:00"), // 11 hours elapsed, 1h of which is lunch
    ]);
    expect(rows[0].totalHours).toBeCloseTo(10, 5);
    expect(rows[0].regularHours).toBeCloseTo(8, 5);
    expect(rows[0].otHours).toBeCloseTo(2, 5);
  });

  it("counts a normal 9-hour check-in span as 8 worked hours (1h untracked lunch), no overtime", () => {
    const rows = buildDailySummary([
      ev("IN", "2026-01-05T08:00:00"),
      ev("OUT", "2026-01-05T17:00:00"), // 9 hours elapsed = 8h work + 1h lunch
    ]);
    expect(rows[0].totalHours).toBeCloseTo(8, 5);
    expect(rows[0].regularHours).toBeCloseTo(8, 5);
    expect(rows[0].otHours).toBe(0);
  });

  it("sums multiple completed sessions in the same day (e.g. a lunch break)", () => {
    const rows = buildDailySummary([
      ev("IN", "2026-01-05T09:00:00"),
      ev("OUT", "2026-01-05T12:00:00"), // 3h
      ev("IN", "2026-01-05T13:00:00"),
      ev("OUT", "2026-01-05T18:00:00"), // 5h
    ]);
    expect(rows[0].totalHours).toBeCloseTo(8, 5);
    // display start/end still reflect first check-in and last check-out of the day
    expect(rows[0].startTime?.getHours()).toBe(9);
    expect(rows[0].endTime?.getHours()).toBe(18);
  });

  it("marks the day as still working when the last event is an unmatched IN", () => {
    const rows = buildDailySummary([
      ev("IN", "2026-01-05T09:00:00"),
      ev("OUT", "2026-01-05T12:00:00"),
      ev("IN", "2026-01-05T13:00:00"), // no matching OUT yet
    ]);
    expect(rows[0].stillWorking).toBe(true);
    // only the closed 09:00-12:00 session counts toward hours so far
    expect(rows[0].totalHours).toBeCloseTo(3, 5);
    // the open session started at 13:00 — a caller can use this to show a
    // live "hours so far" instead of the frozen totalHours above
    expect(rows[0].openSince?.toISOString()).toBe(new Date("2026-01-05T13:00:00").toISOString());
  });

  it("reports openSince as null once the day's last session is closed", () => {
    const rows = buildDailySummary([
      ev("IN", "2026-01-05T09:00:00"),
      ev("OUT", "2026-01-05T17:00:00"),
    ]);
    expect(rows[0].stillWorking).toBe(false);
    expect(rows[0].openSince).toBeNull();
  });

  it("ignores a duplicate IN tap before the matching OUT", () => {
    const rows = buildDailySummary([
      ev("IN", "2026-01-05T09:00:00"),
      ev("IN", "2026-01-05T09:00:05"), // accidental double tap
      ev("OUT", "2026-01-05T17:00:00"),
    ]);
    expect(rows[0].totalHours).toBeCloseTo(8, 5);
  });

  it("ignores a stray OUT with no open IN session", () => {
    const rows = buildDailySummary([
      ev("OUT", "2026-01-05T09:00:00"), // stray, e.g. leftover from previous day
      ev("IN", "2026-01-05T10:00:00"),
      ev("OUT", "2026-01-05T14:00:00"),
    ]);
    expect(rows[0].totalHours).toBeCloseTo(4, 5);
  });

  it("groups events into separate rows per calendar day", () => {
    const rows = buildDailySummary([
      ev("IN", "2026-01-05T09:00:00"),
      ev("OUT", "2026-01-05T17:00:00"),
      ev("IN", "2026-01-06T09:00:00"),
      ev("OUT", "2026-01-06T17:00:00"),
    ]);
    expect(rows).toHaveLength(2);
    // newest day first
    expect(rows[0].dateKey).toBe("2026-01-06");
    expect(rows[1].dateKey).toBe("2026-01-05");
  });

  it("records the location of the first check-in of the day", () => {
    const rows = buildDailySummary([
      ev("IN", "2026-01-05T09:00:00", "OUTSIDE"),
      ev("OUT", "2026-01-05T17:00:00", "OFFICE"),
    ]);
    expect(rows[0].location).toBe("OUTSIDE");
  });

  it("attributes a session crossing midnight entirely to the day it started", () => {
    const rows = buildDailySummary([
      ev("IN", "2026-01-05T09:00:00"),
      ev("OUT", "2026-01-05T12:00:00"), // lunch break
      ev("IN", "2026-01-05T13:00:00"),
      ev("OUT", "2026-01-06T07:00:00"), // OT overnight, ends after midnight
    ]);
    // no spurious zero-hour row for the day the OUT landed on
    expect(rows).toHaveLength(1);
    expect(rows[0].dateKey).toBe("2026-01-05");
    expect(rows[0].stillWorking).toBe(false);
    // 3h (09-12) + 18h (13:00 -> next day 07:00, over 8h so -1h lunch) = 20h
    expect(rows[0].totalHours).toBeCloseTo(20, 5);
    expect(rows[0].regularHours).toBeCloseTo(8, 5);
    expect(rows[0].otHours).toBeCloseTo(12, 5);
    expect(rows[0].startTime?.toISOString()).toBe(new Date("2026-01-05T09:00:00").toISOString());
    expect(rows[0].endTime?.toISOString()).toBe(new Date("2026-01-06T07:00:00").toISOString());
  });

  it("still marks the day as working when an overnight session hasn't checked out yet", () => {
    const rows = buildDailySummary([
      ev("IN", "2026-01-05T22:00:00"), // clocked in late, still working past midnight
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].dateKey).toBe("2026-01-05");
    expect(rows[0].stillWorking).toBe(true);
    expect(rows[0].openSince?.toISOString()).toBe(new Date("2026-01-05T22:00:00").toISOString());
  });
});
