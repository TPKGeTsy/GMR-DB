import { describe, expect, it } from "vitest";
import { PAGE_HELP, PAGE_HELP_IDS } from "./pageHelp";
import { LUNCH_BREAK_HOURS, MIN_OT_HOURS, REGULAR_HOURS_CAP } from "./attendance";

describe("PAGE_HELP", () => {
  it("every page explains purpose, features and data sources", () => {
    for (const id of PAGE_HELP_IDS) {
      const h = PAGE_HELP[id];
      expect(h.title, id).not.toBe("");
      expect(h.purpose, id).not.toBe("");
      expect(h.features.length, id).toBeGreaterThan(0);
      expect(h.sources.length, id).toBeGreaterThan(0);
    }
  });

  it("links point at internal paths", () => {
    for (const id of PAGE_HELP_IDS) {
      for (const l of PAGE_HELP[id].links ?? []) expect(l.href.startsWith("/"), `${id} ${l.href}`).toBe(true);
    }
  });

  it("wage help quotes the live constants and a consistent worked example", () => {
    const rule = PAGE_HELP.wages.rules!.find((r) => r.title.startsWith("ค่า OT"))!;
    expect(rule.example).toContain("234 บาท");
    expect(rule.example).toContain("734 บาท");
    const base = PAGE_HELP.wages.rules!.find((r) => r.title.startsWith("ค่าแรงฐาน"))!;
    expect(base.example).toContain("= 300 บาท");
    const hours = PAGE_HELP.wages.rules!.find((r) => r.title.startsWith("ชั่วโมงทำงาน"))!;
    expect(hours.body).toContain(`${REGULAR_HOURS_CAP} ชม.`);
    expect(hours.body).toContain(`${LUNCH_BREAK_HOURS} ชม.`);
    expect(hours.body).toContain(`${MIN_OT_HOURS} ชม.`);
  });
});
