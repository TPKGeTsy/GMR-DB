import { describe, expect, it } from "vitest";
import { checkWiring } from "./check";

const board = (id: string, libraryId: string, label?: string) => ({ id, type: "board", data: { libraryId, ...(label ? { label } : {}) } });
const wire = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string) => ({ id, source, target, sourceHandle, targetHandle });

const nodes = [
  board("uno", "arduino-uno-r3"),
  board("esp", "esp32-devkit-v1", "ESP32 หลัก"),
  board("pi", "raspberry-pi-40"),
  board("relay", "relay-module-4ch"),
  board("sonar", "hc-sr04"),
  board("psu", "dc-supply-12v"),
];

const messages = (edges: ReturnType<typeof wire>[], list = nodes) => checkWiring(list, edges).map((i) => `${i.severity}:${i.message}`);

describe("checkWiring", () => {
  it("does not complain about a correct hookup (Uno 5V + GND to a relay, D2 to IN1)", () => {
    const issues = checkWiring(nodes, [
      wire("e1", "uno", "5V", "relay", "VCC"),
      wire("e2", "uno", "GND", "relay", "GND"),
      wire("e3", "uno", "D2", "relay", "IN1"),
    ]);
    expect(issues).toEqual([]);
  });

  it("flags a short circuit: 5 V straight to GND", () => {
    const [issue] = checkWiring(nodes, [wire("e1", "uno", "5V", "relay", "GND")]);
    expect(issue.severity).toBe("error");
    expect(issue.message).toContain("ลัดวงจร");
    expect(issue.edgeId).toBe("e1");
  });

  it("flags two supplies of different voltage", () => {
    const issues = checkWiring(nodes, [wire("e1", "uno", "5V", "uno", "3V3")]);
    expect(issues.some((i) => i.severity === "error" && i.message.includes("แรงดันไม่เท่ากัน"))).toBe(true);
  });

  it("flags 5 V logic into a 3.3 V pin (HC-SR04 ECHO -> ESP32), and accepts it into a 5 V board", () => {
    const bad = checkWiring(nodes, [wire("e1", "sonar", "ECHO", "esp", "GPIO13")]);
    expect(bad.some((i) => i.severity === "error" && i.message.includes("ตัวลดระดับสัญญาณ"))).toBe(true);
    const good = checkWiring(nodes, [wire("e1", "sonar", "ECHO", "uno", "D7")]);
    expect(good).toEqual([]);
  });

  it("flags 5 V supply on a 3.3 V GPIO as damaging", () => {
    const issues = messages([wire("e1", "uno", "5V", "pi", "P11")]);
    expect(issues.some((m) => m.startsWith("error:") && m.includes("อุปกรณ์เสียหาย"))).toBe(true);
  });

  it("flags relay contacts wired to a signal pin", () => {
    const issues = messages([wire("e1", "relay", "CH1_NO", "uno", "D3")]);
    expect(issues.some((m) => m.includes("หน้าสัมผัสรีเลย์"))).toBe(true);
  });

  it("warns about pins to avoid, using the board's label", () => {
    const issues = messages([wire("e1", "esp", "GPIO12", "relay", "IN1")]);
    expect(issues.some((m) => m.startsWith("warning:") && m.includes("ESP32 หลัก · GPIO12"))).toBe(true);
  });

  it("warns when one signal pin drives two wires, but lets supply and ground be shared", () => {
    const signal = checkWiring(nodes, [wire("e1", "uno", "D4", "relay", "IN1"), wire("e2", "uno", "D4", "relay", "IN2")]);
    expect(signal.filter((i) => i.message.includes("ซ้อนกัน"))).toHaveLength(2);
    const shared = checkWiring(nodes, [wire("e1", "uno", "GND", "relay", "GND"), wire("e2", "uno", "GND", "sonar", "GND")]);
    expect(shared).toEqual([]);
  });

  it("ignores free-form (non-library) nodes", () => {
    expect(
      checkWiring([{ id: "a", type: "esp32", data: {} }, board("uno", "arduino-uno-r3")], [wire("e1", "a", "pin_3v3", "uno", "GND")])
    ).toEqual([]);
  });
});
