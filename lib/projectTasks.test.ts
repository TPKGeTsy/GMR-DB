import { describe, expect, it } from "vitest";
import { addDays, dailyTaskMessage, daysBetween, isDateKey, overloadedDays } from "./projectTasks";

describe("projectTasks", () => {
  it("does day maths on date keys", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(daysBetween("2026-01-01", "2026-01-11")).toBe(10);
    expect(isDateKey("2026-02-30")).toBe(false);
  });

  it("finds days above the daily capacity", () => {
    const t = [
      { userId: "a", startKey: "2026-03-01", endKey: "2026-03-03" },
      { userId: "a", startKey: "2026-03-03", endKey: "2026-03-04" },
      { userId: "b", startKey: "2026-03-03", endKey: "2026-03-03" },
    ];
    expect(overloadedDays(t, "a", 1)).toEqual(["2026-03-03"]);
    expect(overloadedDays(t, "a", 2)).toEqual([]);
  });

  it("builds the daily message grouped by project", () => {
    expect(dailyTaskMessage([])).toBeNull();
    const m = dailyTaskMessage([
      { projectName: "ABC", duty: "ตัดเหล็ก", note: null, endKey: "2026-03-05" },
      { projectName: "ABC", duty: "เชื่อม", note: "ชุด A", endKey: "2026-03-06" },
    ])!;
    expect(m).toContain("📁 ABC");
    expect(m).toContain("• เชื่อม (ชุด A) — ถึง 06/03/2026");
  });
});
