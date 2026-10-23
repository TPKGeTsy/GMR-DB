import { describe, it, expect } from "vitest";
import { channelsDueForAutoOff, describeAutoOff, isAutoOffEnabled, parseAutoOffConfig } from "./autoOff";

// Bangkok is UTC+7, so 20:00 Bangkok = 13:00Z.
const at = (iso: string) => new Date(iso);
const row = (channel: number, updatedAt: string, isOn = true) => ({ channel, isOn, updatedAt: at(updatedAt) });
const on = (...channels: number[]) => Array.from({ length: 16 }, (_, i) => channels.includes(i));

describe("parseAutoOffConfig", () => {
  it("defaults to a 20:00 daily cutoff and no max duration", () => {
    expect(parseAutoOffConfig({})).toEqual({ maxOnMs: null, dailyOff: { hour: 20, minute: 0 } });
  });

  it("reads a custom time and a max duration", () => {
    expect(parseAutoOffConfig({ MODBUS_AUTO_OFF_TIME: "18:30", MODBUS_AUTO_OFF_HOURS: "10" })).toEqual({
      maxOnMs: 10 * 3_600_000,
      dailyOff: { hour: 18, minute: 30 },
    });
  });

  it("lets the daily cutoff be switched off, and ignores bad values", () => {
    expect(parseAutoOffConfig({ MODBUS_AUTO_OFF_TIME: "off" }).dailyOff).toBeNull();
    expect(parseAutoOffConfig({ MODBUS_AUTO_OFF_TIME: "25:00" }).dailyOff).toBeNull();
    expect(parseAutoOffConfig({ MODBUS_AUTO_OFF_HOURS: "-3" }).maxOnMs).toBeNull();
    expect(isAutoOffEnabled(parseAutoOffConfig({ MODBUS_AUTO_OFF_TIME: "off" }))).toBe(false);
  });
});

describe("channelsDueForAutoOff", () => {
  const cfg = parseAutoOffConfig({}); // daily 20:00 Bangkok

  it("leaves outputs alone before the cutoff", () => {
    // turned on 09:00 Bangkok (02:00Z), checked 19:59 Bangkok (12:59Z)
    expect(channelsDueForAutoOff(on(0), [row(0, "2026-10-17T02:00:00Z")], at("2026-10-17T12:59:00Z"), cfg)).toEqual([]);
  });

  it("switches off outputs left on past the cutoff", () => {
    expect(channelsDueForAutoOff(on(0, 3), [row(0, "2026-10-17T02:00:00Z"), row(3, "2026-10-17T03:00:00Z")], at("2026-10-17T13:00:00Z"), cfg)).toEqual([0, 3]);
  });

  it("waits for the NEXT cutoff when turned on after today's", () => {
    // on at 21:00 Bangkok (14:00Z); 21:30 Bangkok is not due, next day 20:00 is
    const rows = [row(2, "2026-10-17T14:00:00Z")];
    expect(channelsDueForAutoOff(on(2), rows, at("2026-10-17T14:30:00Z"), cfg)).toEqual([]);
    expect(channelsDueForAutoOff(on(2), rows, at("2026-10-18T12:59:00Z"), cfg)).toEqual([]);
    expect(channelsDueForAutoOff(on(2), rows, at("2026-10-18T13:00:00Z"), cfg)).toEqual([2]);
  });

  it("ignores channels the module already reports OFF, or saved as OFF", () => {
    expect(channelsDueForAutoOff(on(), [row(0, "2026-10-17T02:00:00Z")], at("2026-10-17T15:00:00Z"), cfg)).toEqual([]);
    expect(channelsDueForAutoOff(on(0), [row(0, "2026-10-17T02:00:00Z", false)], at("2026-10-17T15:00:00Z"), cfg)).toEqual([]);
  });

  it("applies the max duration rule independently", () => {
    const timerOnly = parseAutoOffConfig({ MODBUS_AUTO_OFF_TIME: "off", MODBUS_AUTO_OFF_HOURS: "2" });
    const rows = [row(1, "2026-10-17T02:00:00Z")];
    expect(channelsDueForAutoOff(on(1), rows, at("2026-10-17T03:59:00Z"), timerOnly)).toEqual([]);
    expect(channelsDueForAutoOff(on(1), rows, at("2026-10-17T04:00:00Z"), timerOnly)).toEqual([1]);
  });

  it("does nothing when both rules are off", () => {
    const none = parseAutoOffConfig({ MODBUS_AUTO_OFF_TIME: "off" });
    expect(channelsDueForAutoOff(on(0), [row(0, "2026-10-01T00:00:00Z")], at("2026-10-17T15:00:00Z"), none)).toEqual([]);
  });
});

describe("describeAutoOff", () => {
  it("describes the active rules in Thai", () => {
    expect(describeAutoOff(parseAutoOffConfig({}))).toBe("ปิดเอาต์พุตที่ลืมปิดให้อัตโนมัติ ทุกวันเวลา 20:00");
    expect(describeAutoOff(parseAutoOffConfig({ MODBUS_AUTO_OFF_HOURS: "10" }))).toContain("เกิน 10 ชั่วโมง");
    expect(describeAutoOff(parseAutoOffConfig({ MODBUS_AUTO_OFF_TIME: "off" }))).toBeNull();
  });
});
