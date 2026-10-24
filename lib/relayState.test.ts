import { describe, it, expect } from "vitest";
import {
  COIL_COUNT,
  channelAt,
  defaultChannelMap,
  normalizeChannelMap,
  sameChannelMap,
  swapIntoLocation,
  validateChannelMap,
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


describe("channel wiring map", () => {
  it("defaults to channel n -> the next free coil, module by module", () => {
    const map = defaultChannelMap();
    expect(map).toHaveLength(COIL_COUNT);
    expect(map[0]).toEqual({ module: 0, address: 0 });
    expect(map[15]).toEqual({ module: 0, address: 15 });
    expect(map[16]).toEqual({ module: 1, address: 0 });
    expect(map[31]).toEqual({ module: 1, address: 15 });
    expect(validateChannelMap(map)).toBeNull();
    // the old helpers and the default map agree
    for (let c = 0; c < COIL_COUNT; c++) {
      expect(moduleOfChannel(c, map)).toBe(moduleOfChannel(c));
      expect(localCoil(c, map)).toBe(localCoil(c));
    }
  });

  it("rejects maps with a wrong length, out-of-range values or a shared output", () => {
    expect(validateChannelMap([])).not.toBeNull();
    expect(validateChannelMap("nope")).not.toBeNull();
    const outOfRange = defaultChannelMap();
    outOfRange[3] = { module: 0, address: 16 };
    expect(validateChannelMap(outOfRange)).not.toBeNull();
    const badModule = defaultChannelMap();
    badModule[3] = { module: 2, address: 0 };
    expect(validateChannelMap(badModule)).not.toBeNull();
    const fractional = defaultChannelMap();
    fractional[3] = { module: 0, address: 1.5 };
    expect(validateChannelMap(fractional)).not.toBeNull();
    const duplicate = defaultChannelMap();
    duplicate[5] = { ...duplicate[4] };
    expect(validateChannelMap(duplicate)).toMatch(/ซ้ำ/);
  });

  it("falls back to the default wiring for any map it can't trust", () => {
    const duplicate = defaultChannelMap();
    duplicate[5] = { ...duplicate[4] };
    expect(normalizeChannelMap(duplicate)).toEqual(defaultChannelMap());
    expect(normalizeChannelMap(null)).toEqual(defaultChannelMap());
    expect(normalizeChannelMap([{ module: 0, address: 0 }])).toEqual(defaultChannelMap());
    const good = swapIntoLocation(defaultChannelMap(), 2, 1, 7).map;
    expect(normalizeChannelMap(good)).toEqual(good);
  });

  it("wiring a channel to a free-looking output swaps it with whoever was there", () => {
    const start = defaultChannelMap(); // ch0 = m0/a0, ch6 = m0/a6
    const { map, displaced } = swapIntoLocation(start, 0, 0, 6);
    expect(map[0]).toEqual({ module: 0, address: 6 });
    expect(map[6]).toEqual({ module: 0, address: 0 }); // trades places
    expect(displaced).toBe(6);
    expect(validateChannelMap(map)).toBeNull();
    expect(start).toEqual(defaultChannelMap()); // input untouched
  });

  it("can move a channel to the other module", () => {
    const { map } = swapIntoLocation(defaultChannelMap(), 1, 1, 3);
    expect(map[1]).toEqual({ module: 1, address: 3 });
    expect(map[19]).toEqual({ module: 0, address: 1 }); // ch19 was m1/a3
    expect(moduleOfChannel(1, map)).toBe(1);
    expect(localCoil(1, map)).toBe(3);
    expect(validateChannelMap(map)).toBeNull();
  });

  it("is a no-op when the channel is already there", () => {
    const { map, displaced } = swapIntoLocation(defaultChannelMap(), 4, 0, 4);
    expect(displaced).toBeNull();
    expect(sameChannelMap(map, defaultChannelMap())).toBe(true);
  });

  it("refuses targets that don't exist", () => {
    expect(() => swapIntoLocation(defaultChannelMap(), 0, 2, 0)).toThrow(RangeError);
    expect(() => swapIntoLocation(defaultChannelMap(), 0, 0, 16)).toThrow(RangeError);
    expect(() => swapIntoLocation(defaultChannelMap(), 32, 0, 0)).toThrow(RangeError);
  });

  it("finds which channel is wired to an output", () => {
    const { map } = swapIntoLocation(defaultChannelMap(), 5, 1, 2);
    expect(channelAt(map, 1, 2)).toBe(5);
    expect(channelAt(map, 0, 5)).toBe(18); // ch18 (m1/a2) traded into ch5's old place
  });

  it("uses the map when deciding which channels are reachable / displayed", () => {
    const { map } = swapIntoLocation(defaultChannelMap(), 0, 1, 0); // ch0 now lives on module 2
    const saved = new Array(COIL_COUNT).fill(null);
    saved[0] = true;
    const live = new Array(COIL_COUNT).fill(false);
    const modules = [
      { configured: true, online: true },
      { configured: true, online: false },
    ];
    // module 2 is down: ch0 shows its saved value, not the (meaningless) live one
    expect(displayStates(live, modules, saved, map)[0]).toBe(true);
    // with the default wiring ch0 is on module 1 (online), so the live value shows
    expect(displayStates(live, modules, saved)[0]).toBe(false);
    expect(restorableMismatches(live, modules, saved, map)).not.toContain(0);
    expect(restorableMismatches(live, modules, saved)).toContain(0);
  });
});
