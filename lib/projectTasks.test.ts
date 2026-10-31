import { describe, expect, it } from "vitest";
import { addDays, dailyTaskMessage, daysBetween, eveningTaskMessage, isDateKey, overloadedDays } from "./projectTasks";

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

describe("eveningTaskMessage", () => {
  const base = { projectName: "P1", note: null, startKey: "2026-11-01", endKey: "2026-11-03", doneKey: null };
  it("says nothing when there is nothing to say", () => {
    expect(eveningTaskMessage([], "2026-11-02")).toBeNull();
    expect(eveningTaskMessage([{ ...base, duty: "เก่า", endKey: "2026-10-01", startKey: "2026-09-01", doneKey: "2026-10-01" }], "2026-11-02")).toBeNull();
  });
  it("groups done today, overdue, open today and tomorrow", () => {
    const text = eveningTaskMessage(
      [
        { ...base, duty: "ตัดเหล็ก", doneKey: "2026-11-02" },
        { ...base, duty: "เชื่อม", startKey: "2026-10-20", endKey: "2026-10-30" },
        { ...base, duty: "ทาสี" },
        { ...base, duty: "ส่งมอบ", startKey: "2026-11-03", endKey: "2026-11-05" },
      ],
      "2026-11-02"
    )!;
    expect(text).toContain("เสร็จวันนี้ 1 งาน");
    expect(text).toContain("เลยกำหนดแล้วยังไม่เสร็จ");
    expect(text).toContain("เชื่อม (ครบ 30/10)");
    expect(text).toContain("ยังไม่เสร็จของวันนี้");
    expect(text).toContain("เริ่มพรุ่งนี้");
  });
});
