import { describe, expect, it } from "vitest";
import {
  ALL_DAYS,
  CATCH_UP_MINUTES,
  bangkokClock,
  describeDays,
  isDue,
  parseTime,
  validateSchedule,
  type ScheduleRow,
} from "./modbusSchedule";

// 2026-10-26 is a Monday. Bangkok = UTC+7, so 08:00 Bangkok = 01:00 UTC.
const at = (hhmm: string, day = "2026-10-26") => new Date(`${day}T${hhmm}:00+07:00`);

const base: ScheduleRow = {
  id: "s1",
  title: "เปิดไฟเช้า",
  time: "08:00",
  days: ALL_DAYS,
  action: "ON",
  channels: [0, 1],
  enabled: true,
  lastRunDateKey: null,
};

describe("parseTime", () => {
  it("accepts HH:mm and rejects everything else", () => {
    expect(parseTime("00:00")).toBe(0);
    expect(parseTime("08:05")).toBe(485);
    expect(parseTime("23:59")).toBe(1439);
    for (const bad of ["24:00", "8:00", "08:60", "08.00", "", "abc", null, undefined, 800]) {
      expect(parseTime(bad)).toBeNull();
    }
  });
});

describe("validateSchedule", () => {
  const good = { title: " เปิดไฟเช้า ", time: "08:00", days: [3, 1, 1], action: "ON", channels: [5, 2, 2] };

  it("cleans a valid schedule (trim, sort, de-duplicate)", () => {
    const r = validateSchedule(good);
    expect(r).toEqual({ ok: true, value: { title: "เปิดไฟเช้า", time: "08:00", days: [1, 3], action: "ON", channels: [2, 5] } });
  });

  it("rejects each kind of bad input with a message", () => {
    expect(validateSchedule({ ...good, time: "8am" })).toMatchObject({ ok: false });
    expect(validateSchedule({ ...good, days: [] })).toMatchObject({ ok: false });
    expect(validateSchedule({ ...good, days: [7] })).toMatchObject({ ok: false });
    expect(validateSchedule({ ...good, days: "mon" })).toMatchObject({ ok: false });
    expect(validateSchedule({ ...good, action: "TOGGLE" })).toMatchObject({ ok: false });
    expect(validateSchedule({ ...good, channels: [] })).toMatchObject({ ok: false });
    expect(validateSchedule({ ...good, channels: [32] })).toMatchObject({ ok: false });
    expect(validateSchedule({ ...good, channels: [-1] })).toMatchObject({ ok: false });
    expect(validateSchedule({ ...good, channels: [1.5] })).toMatchObject({ ok: false });
    expect(validateSchedule({ ...good, title: "x".repeat(61) })).toMatchObject({ ok: false });
  });

  it("allows an empty title", () => {
    expect(validateSchedule({ ...good, title: "" })).toMatchObject({ ok: true });
  });
});

describe("bangkokClock", () => {
  it("reads the Bangkok date, minute and weekday of an instant", () => {
    expect(bangkokClock(at("08:30"))).toEqual({ dateKey: "2026-10-26", minutes: 510, weekday: 1 });
    // 17:30 UTC on the 25th is already 00:30 on the 26th in Bangkok
    expect(bangkokClock(new Date("2026-10-25T17:30:00Z"))).toEqual({ dateKey: "2026-10-26", minutes: 30, weekday: 1 });
  });
});

describe("isDue", () => {
  it("fires at its minute", () => {
    expect(isDue(base, at("08:00"))).toBe(true);
  });

  it("never fires before its time", () => {
    expect(isDue(base, at("07:59"))).toBe(false);
  });

  it("still fires a few minutes late (cron lag / restart), but not after the catch-up window", () => {
    expect(isDue(base, at("08:03"))).toBe(true);
    expect(isDue(base, at(`08:0${CATCH_UP_MINUTES}`))).toBe(true);
    expect(isDue(base, at(`08:0${CATCH_UP_MINUTES + 1}`))).toBe(false);
    expect(isDue(base, at("12:00"))).toBe(false);
  });

  it("runs once a day: not again once it has run today, but again tomorrow", () => {
    const ran = { ...base, lastRunDateKey: "2026-10-26" };
    expect(isDue(ran, at("08:01"))).toBe(false);
    expect(isDue(ran, at("08:00", "2026-10-27"))).toBe(true);
  });

  it("respects the chosen weekdays", () => {
    const weekdaysOnly = { ...base, days: [1, 2, 3, 4, 5] };
    expect(isDue(weekdaysOnly, at("08:00", "2026-10-26"))).toBe(true); // Monday
    expect(isDue(weekdaysOnly, at("08:00", "2026-10-31"))).toBe(false); // Saturday
    expect(isDue(weekdaysOnly, at("08:00", "2026-11-01"))).toBe(false); // Sunday
  });

  it("ignores disabled schedules and bad times", () => {
    expect(isDue({ ...base, enabled: false }, at("08:00"))).toBe(false);
    expect(isDue({ ...base, time: "nope" }, at("08:00"))).toBe(false);
  });

  it("handles a schedule just after midnight", () => {
    const midnight = { ...base, time: "00:00" };
    expect(isDue(midnight, new Date("2026-10-25T17:02:00Z"))).toBe(true); // 00:02 Bangkok on the 26th
    expect(isDue(midnight, new Date("2026-10-25T16:59:00Z"))).toBe(false); // 23:59 on the 25th
  });
});

describe("describeDays", () => {
  it("summarises common day sets", () => {
    expect(describeDays(ALL_DAYS)).toBe("ทุกวัน");
    expect(describeDays([1, 2, 3, 4, 5])).toBe("จ.–ศ.");
    expect(describeDays([6, 0])).toBe("ส.–อา.");
    expect(describeDays([1, 3])).toBe("จ พ");
    expect(describeDays([0, 2])).toBe("อ อา");
  });
});
