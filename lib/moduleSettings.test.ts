import { describe, it, expect } from "vitest";
import { isPrivateIPv4, normalizeOverrides, sameOverride, validateModuleSettings } from "./moduleSettings";

describe("isPrivateIPv4", () => {
  it("accepts the private LAN ranges", () => {
    for (const ip of ["10.0.0.1", "10.123.72.111", "172.16.0.5", "172.31.255.254", "192.168.1.12", "192.168.10.244"]) {
      expect(isPrivateIPv4(ip)).toBe(true);
    }
  });

  it("rejects public, loopback, link-local and malformed addresses", () => {
    for (const ip of ["8.8.8.8", "172.32.0.1", "172.15.0.1", "192.169.1.1", "127.0.0.1", "169.254.1.1", "0.0.0.0", "example.com", "192.168.1", "192.168.1.256", "192.168.1.1.1", ""]) {
      expect(isPrivateIPv4(ip)).toBe(false);
    }
  });
});

describe("validateModuleSettings", () => {
  it("accepts a good address and fills in the default port and unit ID", () => {
    expect(validateModuleSettings({ host: " 192.168.1.12 " })).toEqual({
      ok: true,
      value: { host: "192.168.1.12", port: 502, unitId: 1 },
    });
    expect(validateModuleSettings({ host: "10.0.0.7", port: "1502", unitId: "3" })).toEqual({
      ok: true,
      value: { host: "10.0.0.7", port: 1502, unitId: 3 },
    });
    expect(validateModuleSettings({ host: "10.0.0.7", port: "", unitId: "" })).toMatchObject({ ok: true });
  });

  it("explains what is wrong", () => {
    expect(validateModuleSettings({ host: "" })).toMatchObject({ ok: false, error: expect.stringContaining("ใส่ IP") });
    expect(validateModuleSettings({ host: "not-an-ip" })).toMatchObject({ ok: false, error: expect.stringContaining("ไม่ถูกต้อง") });
    expect(validateModuleSettings({ host: "8.8.8.8" })).toMatchObject({ ok: false, error: expect.stringContaining("ภายใน") });
    expect(validateModuleSettings({ host: "10.0.0.7", port: "0" })).toMatchObject({ ok: false, error: expect.stringContaining("พอร์ต") });
    expect(validateModuleSettings({ host: "10.0.0.7", port: "70000" })).toMatchObject({ ok: false });
    expect(validateModuleSettings({ host: "10.0.0.7", port: "50.5" })).toMatchObject({ ok: false });
    expect(validateModuleSettings({ host: "10.0.0.7", unitId: "256" })).toMatchObject({ ok: false, error: expect.stringContaining("Unit ID") });
    expect(validateModuleSettings({ host: 12345 })).toMatchObject({ ok: false });
  });

  it("allows Unit ID 0", () => {
    expect(validateModuleSettings({ host: "10.0.0.7", unitId: 0 })).toMatchObject({ ok: true, value: { unitId: 0 } });
  });
});

describe("normalizeOverrides", () => {
  it("returns one entry per module, null where nothing valid is set", () => {
    const out = normalizeOverrides([{ host: "192.168.1.12", port: 502, unitId: 1 }], 2);
    expect(out).toEqual([{ host: "192.168.1.12", port: 502, unitId: 1 }, null]);
  });

  it("never trusts a malformed or public address", () => {
    expect(normalizeOverrides([{ host: "8.8.8.8" }, "x"], 2)).toEqual([null, null]);
    expect(normalizeOverrides(undefined, 2)).toEqual([null, null]);
    expect(normalizeOverrides([null, { host: "10.0.0.9" }], 2)).toEqual([null, { host: "10.0.0.9", port: 502, unitId: 1 }]);
  });
});

describe("sameOverride", () => {
  it("compares field by field and treats missing as equal to missing", () => {
    const a = { host: "10.0.0.1", port: 502, unitId: 1 };
    expect(sameOverride(a, { ...a })).toBe(true);
    expect(sameOverride(a, { ...a, port: 503 })).toBe(false);
    expect(sameOverride(a, null)).toBe(false);
    expect(sameOverride(null, undefined)).toBe(true);
  });
});
