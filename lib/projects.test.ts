import { describe, it, expect } from "vitest";
import { getDeadlineStatus } from "./projects";

describe("getDeadlineStatus", () => {
  it("returns null when there is no deadline", () => {
    expect(getDeadlineStatus(null, "ACTIVE")).toBeNull();
  });

  it("is 'done' for a completed project regardless of the date", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect(getDeadlineStatus(yesterday, "COMPLETED")?.tone).toBe("done");
  });

  it("is 'overdue' when the deadline has passed and the project isn't completed", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const status = getDeadlineStatus(yesterday, "ACTIVE");
    expect(status?.tone).toBe("overdue");
    expect(status?.daysRemaining).toBeLessThan(0);
  });

  it("is 'urgent' when the deadline is today (a date-only value, so already 'past' midnight)", () => {
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    expect(getDeadlineStatus(todayMidnight.toISOString(), "ACTIVE")?.tone).toBe("urgent");
  });

  it("is 'warning' when the deadline is within a week", () => {
    const in3Days = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(getDeadlineStatus(in3Days, "ACTIVE")?.tone).toBe("warning");
  });

  it("is 'ok' when the deadline is comfortably far away", () => {
    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(getDeadlineStatus(in30Days, "ACTIVE")?.tone).toBe("ok");
  });
});
