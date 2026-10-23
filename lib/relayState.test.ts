import { describe, it, expect } from "vitest";
import {
  COIL_COUNT,
  desiredStates,
  describeModuleStatus,
  displayStates,
  findMismatches,
  hasAnySaved,
  localCoil,
  moduleOfChannel,
  restorableMismatches,
  savedFromRows,
  statesFromSaved,
} from "./relayState";

describe("relayState", () => {
  it("builds a per-channel saved list, null where nothing was saved", () => {
    const saved = savedFromRows(
      [
        { channel: 0, isOn: true },
        { channel: 3, isOn: false },
        { channel: 99, isOn: true }, // out of range, ignored
      ],
      4
    );
    expect(saved).toEqual([true, null, null, false]);
  });

  it("finds channels whose live state differs from the saved one", () => {
    const device = [false, false, true, false];
    const saved = [true, null, true, false];
    expect(findMismatches(device, saved)).toEqual([0]);
  });

  it("ignores channels that were never saved", () => {
    expect(findMismatches([true, true], [null, null])).toEqual([]);
  });

  it("restores saved values and leaves unsaved channels untouched", () => {
    expect(desiredStates([false, true, false], [true, null, false])).toEqual([true, true, false]);
  });

  it("falls back to OFF for unsaved channels when offline", () => {
    expect(statesFromSaved([true, null, false])).toEqual([true, false, false]);
  });

  it("knows whether anything was ever saved", () => {
    expect(hasAnySaved([null, null])).toBe(false);
    expect(hasAnySaved([null, false])).toBe(true);
  });
});

describe("relayState with two modules", () => {
  const online = { configured: true, online: true };
  const offline = { configured: true, online: false };
  const missing = { configured: false, online: false };

  it("maps global channels to modules and local coils", () => {
    expect(moduleOfChannel(0)).toBe(0);
    expect(moduleOfChannel(15)).toBe(0);
    expect(moduleOfChannel(16)).toBe(1);
    expect(moduleOfChannel(31)).toBe(1);
    expect(localCoil(17)).toBe(1);
    expect(COIL_COUNT).toBe(32);
  });

  it("shows live state for online modules and the saved copy for the rest", () => {
    const live = new Array(32).fill(false);
    live[2] = true; // module 1 is online
    const saved: (boolean | null)[] = new Array(32).fill(null);
    saved[2] = false; // ignored: live wins on an online module
    saved[18] = true; // module 2 is offline -> saved copy is shown
    const shown = displayStates(live, [online, offline], saved);
    expect(shown[2]).toBe(true);
    expect(shown[18]).toBe(true);
    expect(shown[19]).toBe(false);
  });

  it("only counts mismatches on modules that answered", () => {
    const device = new Array(32).fill(false);
    const saved: (boolean | null)[] = new Array(32).fill(null);
    saved[1] = true; // module 1 online and lost it
    saved[20] = true; // module 2 offline: can't tell
    expect(restorableMismatches(device, [online, offline], saved)).toEqual([1]);
    expect(restorableMismatches(device, [online, online], saved)).toEqual([1, 20]);
  });

  it("explains why a module is unavailable", () => {
    expect(describeModuleStatus(0, online)).toBeNull();
    expect(describeModuleStatus(1, missing)).toContain("ยังไม่ได้ตั้งค่า");
    expect(describeModuleStatus(1, missing)).toContain("MODBUS_HOST_2");
    expect(describeModuleStatus(0, offline)).toBe("ติดต่อโมดูล 1 ไม่ได้");
    expect(describeModuleStatus(1, undefined)).toBe("ติดต่อโมดูล 2 ไม่ได้");
  });
});
