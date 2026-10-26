import { describe, expect, it } from "vitest";
import { isAgentModeFor } from "./modbusMode";

describe("isAgentModeFor", () => {
  it("defaults to direct mode", () => {
    expect(isAgentModeFor({})).toBe(false);
    expect(isAgentModeFor({ MODBUS_MODE: "direct" })).toBe(false);
    expect(isAgentModeFor({ MODBUS_MODE: "" })).toBe(false);
  });

  it("selects agent mode from MODBUS_MODE, ignoring case and stray spaces", () => {
    expect(isAgentModeFor({ MODBUS_MODE: "agent" })).toBe(true);
    expect(isAgentModeFor({ MODBUS_MODE: "Agent" })).toBe(true);
    expect(isAgentModeFor({ MODBUS_MODE: " agent " })).toBe(true);
  });

  it("is forced to agent mode on Vercel, whatever MODBUS_MODE says", () => {
    expect(isAgentModeFor({ VERCEL: "1" })).toBe(true);
    expect(isAgentModeFor({ VERCEL: "1", MODBUS_MODE: "direct" })).toBe(true);
    expect(isAgentModeFor({ VERCEL: "1", MODBUS_MODE: "typo" })).toBe(true);
  });

  it("does not guess agent mode for other values", () => {
    expect(isAgentModeFor({ MODBUS_MODE: "agnet" })).toBe(false);
    expect(isAgentModeFor({ MODBUS_MODE: "true" })).toBe(false);
  });
});
