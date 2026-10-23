import { describe, it, expect } from "vitest";
import { FLOOR_MAPS, ZONES, ZONE_BY_ID, channelAssignments, zoneIdsInMaps } from "./zones";

const COIL_COUNT = 32; // two 16-channel modules

describe("zones", () => {
  it("puts the 17th zone and the restrooms on module 2, leaving the rest spare", () => {
    expect(ZONE_BY_ID.HIBAY_3_3.channel).toBe(16); // CH17 = module 2, first channel
    expect(ZONE_BY_ID.WC_MALE.channel).toBe(17); // CH18
    expect(ZONE_BY_ID.WC_FEMALE.channel).toBe(18); // CH19
    const list = channelAssignments(COIL_COUNT);
    expect(list.slice(19).every((a) => a.name === "Spare")).toBe(true);
    expect(list.filter((a) => a.name === "Spare")).toHaveLength(13); // CH20-CH32
  });

  it("draws the restrooms as clickable zones with man / woman pictograms", () => {
    expect(ZONE_BY_ID.WC_MALE.icon).toBe("male");
    expect(ZONE_BY_ID.WC_FEMALE.icon).toBe("female");
    const hibay = FLOOR_MAPS.find((m) => m.id === "hibay")!;
    for (const id of ["WC_MALE", "WC_FEMALE"]) {
      const shape = hibay.shapes.find((sh) => sh.zoneId === id);
      expect(shape?.iconAt).toBeDefined();
    }
  });

  it("gives every assigned zone a distinct in-range channel", () => {
    const channels = ZONES.map((z) => z.channel).filter((c): c is number => c !== null);
    expect(new Set(channels).size).toBe(channels.length);
    for (const c of channels) {
      expect(Number.isInteger(c)).toBe(true);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThan(COIL_COUNT);
    }
  });

  it("keeps the channels that already have saved states in the database", () => {
    // CH1 (R1), CH3 (R3) and CH10 (Store 1) were switched from the web before
    // map 2 was redrawn; moving them would re-point those saved states.
    expect(ZONE_BY_ID.R1.channel).toBe(0);
    expect(ZONE_BY_ID.R3.channel).toBe(2);
    expect(ZONE_BY_ID.STORE1.channel).toBe(9);
  });

  it("lists every channel in order, naming the zone or Spare", () => {
    const list = channelAssignments(COIL_COUNT);
    expect(list).toHaveLength(COIL_COUNT);
    expect(list.map((a) => a.channel)).toEqual(Array.from({ length: COIL_COUNT }, (_, i) => i));
    expect(list[0].name).toBe("R1");
    expect(list.filter((a) => a.zone === null).every((a) => a.name === "Spare")).toBe(true);
    const assignedZones = ZONES.filter((z) => z.channel !== null);
    expect(list.filter((a) => a.zone !== null)).toHaveLength(assignedZones.length);
  });

  it("has unique zone ids", () => {
    const ids = ZONES.map((z) => z.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only draws zones that exist, and draws every zone somewhere", () => {
    const drawn = new Set(zoneIdsInMaps());
    for (const id of drawn) expect(ZONE_BY_ID[id]).toBeDefined();
    for (const zone of ZONES) expect(drawn.has(zone.id)).toBe(true);
  });

  it("draws each zone at most once per map", () => {
    for (const map of FLOOR_MAPS) {
      const ids = map.shapes.map((s) => s.zoneId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("keeps pictograms and texts inside the map's viewBox", () => {
    for (const map of FLOOR_MAPS) {
      const [vx, vy, vw, vh] = map.viewBox.split(/\s+/).map(Number);
      const spots = [
        ...map.shapes.flatMap((sh) => (sh.iconAt ? [sh.iconAt] : [])),
        ...(map.texts ?? []).map((t) => t.at),
      ];
      for (const [x, y] of spots) {
        expect(x).toBeGreaterThan(vx);
        expect(x).toBeLessThan(vx + vw);
        expect(y).toBeGreaterThan(vy);
        expect(y).toBeLessThan(vy + vh);
      }
    }
  });

  it("uses well-formed polygon points that sit inside the map's viewBox", () => {
    for (const map of FLOOR_MAPS) {
      const [vx, vy, vw, vh] = map.viewBox.split(/\s+/).map(Number);
      for (const shape of map.shapes) {
        const nums = shape.points.split(/[\s,]+/).map(Number);
        expect(nums.length % 2).toBe(0);
        expect(nums.length).toBeGreaterThanOrEqual(6);
        expect(nums.every((n) => Number.isFinite(n))).toBe(true);
        for (let i = 0; i < nums.length; i += 2) {
          expect(nums[i]).toBeGreaterThanOrEqual(vx);
          expect(nums[i]).toBeLessThanOrEqual(vx + vw);
          expect(nums[i + 1]).toBeGreaterThanOrEqual(vy);
          expect(nums[i + 1]).toBeLessThanOrEqual(vy + vh);
        }
        // label sits inside the viewBox too
        expect(shape.labelAt[0]).toBeGreaterThan(vx);
        expect(shape.labelAt[0]).toBeLessThan(vx + vw);
        expect(shape.labelAt[1]).toBeGreaterThan(vy);
        expect(shape.labelAt[1]).toBeLessThan(vy + vh);
      }
    }
  });
});
