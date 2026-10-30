import { describe, expect, it } from "vitest";
import { COMPONENTS, componentsByCategory, getComponent, getPin, searchComponents, symbolRows } from "./library";

describe("circuit library", () => {
  it("has unique component ids and unique pin ids inside each component", () => {
    expect(new Set(COMPONENTS.map((c) => c.id)).size).toBe(COMPONENTS.length);
    for (const c of COMPONENTS) {
      const ids = c.pins.map((p) => p.id);
      expect(new Set(ids).size, c.id).toBe(ids.length);
      for (const p of c.pins) {
        expect(["left", "right"], `${c.id}/${p.id}`).toContain(p.side);
        expect(p.name, `${c.id}/${p.id}`).not.toBe("");
      }
    }
  });

  it("every part has pins on at least one side, a description and a category group", () => {
    const grouped = componentsByCategory().flatMap((g) => g.components);
    expect(grouped.length).toBe(COMPONENTS.length);
    for (const c of COMPONENTS) {
      expect(c.pins.length, c.id).toBeGreaterThanOrEqual(2);
      expect(c.description, c.id).not.toBe("");
    }
  });

  it("Arduino Uno has the pins of the real header", () => {
    const uno = getComponent("arduino-uno-r3")!;
    for (const id of ["D0", "D13", "A0", "A5", "5V", "3V3", "VIN", "GND", "RESET", "AREF"]) expect(getPin(uno, id), id).toBeDefined();
    expect(getPin(uno, "D13")!.functions).toContain("SPI SCK");
    expect(getPin(uno, "D13")!.voltage).toBe(5);
  });

  it("Arduino Mega has D0-D53 and A0-A15", () => {
    const mega = getComponent("arduino-mega-2560")!;
    expect(mega.pins.filter((p) => /^D\d+$/.test(p.id))).toHaveLength(54);
    expect(mega.pins.filter((p) => /^A\d+$/.test(p.id))).toHaveLength(16);
    expect(getPin(mega, "D20")!.functions).toContain("I2C SDA");
  });

  it("ESP32 DevKit V1 has 30 pins with 3.3 V logic and the right special pins", () => {
    const esp = getComponent("esp32-devkit-v1")!;
    expect(esp.pins).toHaveLength(30);
    expect(getPin(esp, "GPIO21")!.functions).toContain("I2C SDA");
    expect(getPin(esp, "GPIO22")!.functions).toContain("I2C SCL");
    expect(getPin(esp, "GPIO12")!.avoid).toBeTruthy();
    expect(getPin(esp, "GPIO34")!.functions?.join(" ")).toContain("อินพุตเท่านั้น");
    expect(getPin(esp, "GPIO13")!.maxIn).toBeLessThan(5);
  });

  it("Raspberry Pi header: 40 pins, odd on the left, even on the right, like the real one", () => {
    const pi = getComponent("raspberry-pi-40")!;
    expect(pi.pins).toHaveLength(40);
    expect(getPin(pi, "P1")).toMatchObject({ side: "left", name: "3V3", voltage: 3.3 });
    expect(getPin(pi, "P2")).toMatchObject({ side: "right", name: "5V", voltage: 5 });
    expect(getPin(pi, "P3")!.functions).toContain("I2C1 SDA");
    expect(getPin(pi, "P6")!.kind).toBe("ground");
    expect(getPin(pi, "P40")!.name).toBe("GPIO21");
    expect(pi.pins.filter((p) => p.kind === "ground")).toHaveLength(8);
  });

  it("Pico: 40 pins, GP0-GP22 + GP26-28, with the two analog / supply groups", () => {
    const p = getComponent("raspberry-pi-pico")!;
    expect(p.pins).toHaveLength(40);
    expect(p.pins.filter((x) => /^GP\d+$/.test(x.name))).toHaveLength(26);
    expect(getPin(p, "P36")!.name).toBe("3V3");
    expect(getPin(p, "P40")!.name).toBe("VBUS");
  });

  it("a relay module has IN and COM/NO/NC for each channel", () => {
    const r = getComponent("relay-module-4ch")!;
    expect(r.pins.filter((p) => p.kind === "relay")).toHaveLength(12);
    expect(r.pins.filter((p) => /^IN\d$/.test(p.id))).toHaveLength(4);
    expect(symbolRows(r)).toBe(12);
  });

  it("generic templates are marked unverified, real modules verified", () => {
    expect(getComponent("agv-dual-hub-driver-generic")!.verified).toBe(false);
    expect(getComponent("l298n-module")!.verified).toBe(true);
  });

  it("searches names and pin functions", () => {
    expect(searchComponents("esp32").map((c) => c.id)).toContain("esp32-devkit-v1");
    expect(searchComponents("I2C SDA").length).toBeGreaterThan(3);
    expect(searchComponents("ไม่มีของนี้แน่นอน")).toEqual([]);
    expect(searchComponents("")).toHaveLength(COMPONENTS.length);
  });
});
