import { describe, it, expect } from "vitest";
import {
  AGENT_STALE_MS,
  isAgentFresh,
  normalizeDesired,
  parseBearer,
  parseReport,
  parseStoredModules,
  tokensMatch,
} from "./agentProtocol";

describe("agent protocol", () => {
  it("treats a recent report as fresh and an old or missing one as offline", () => {
    const now = Date.parse("2026-10-17T12:00:00Z");
    expect(isAgentFresh(new Date(now - 2_000), now)).toBe(true);
    expect(isAgentFresh(new Date(now - AGENT_STALE_MS), now)).toBe(true);
    expect(isAgentFresh(new Date(now - AGENT_STALE_MS - 1), now)).toBe(false);
    expect(isAgentFresh(null, now)).toBe(false);
  });

  it("extracts a bearer token", () => {
    expect(parseBearer("Bearer abc123")).toBe("abc123");
    expect(parseBearer("bearer  abc123 ")).toBe("abc123");
    expect(parseBearer("Basic abc123")).toBeNull();
    expect(parseBearer(null)).toBeNull();
  });

  it("compares tokens strictly and never accepts an empty one", () => {
    expect(tokensMatch("secret", "secret")).toBe(true);
    expect(tokensMatch("secreT", "secret")).toBe(false);
    expect(tokensMatch("secret-longer", "secret")).toBe(false);
    expect(tokensMatch("", "")).toBe(false);
    expect(tokensMatch("anything", undefined)).toBe(false); // server has no token configured
    expect(tokensMatch(null, "secret")).toBe(false);
  });

  it("accepts only a full list of booleans plus per-module status as a report", () => {
    const states = Array.from({ length: 32 }, (_, i) => i % 2 === 0);
    const modules = [
      { configured: true, online: true },
      { configured: false, online: false },
    ];
    expect(parseReport({ states, modules }, 32, 2)).toEqual({ states, modules });

    expect(parseReport({ states: states.slice(1), modules }, 32, 2)).toBeNull();
    expect(parseReport({ states: states.map((v) => (v ? 1 : 0)), modules }, 32, 2)).toBeNull();
    expect(parseReport({ states }, 32, 2)).toBeNull(); // modules missing
    expect(parseReport({ states, modules: [modules[0]] }, 32, 2)).toBeNull(); // wrong module count
    expect(parseReport({ states, modules: [modules[0], { configured: true }] }, 32, 2)).toBeNull();
    expect(parseReport({}, 32, 2)).toBeNull();
    expect(parseReport(null, 32, 2)).toBeNull();
    expect(parseReport("x", 32, 2)).toBeNull();
  });

  it("reads stored module status back, tolerating junk", () => {
    const ok = [
      { configured: true, online: true },
      { configured: true, online: false },
    ];
    expect(parseStoredModules(ok, 2)).toEqual(ok);
    expect(parseStoredModules(null, 2)).toBeNull();
    expect(parseStoredModules([ok[0]], 2)).toBeNull();
    expect(parseStoredModules("nope", 2)).toBeNull();
  });

  it("normalizes the desired payload to booleans or null", () => {
    expect(normalizeDesired([true, false, null, "x", 1], 6)).toEqual([true, false, null, null, null, null]);
    expect(normalizeDesired(undefined, 3)).toEqual([null, null, null]);
  });
});

describe("isHot (is someone using the web page?)", () => {
  const now = Date.parse("2026-10-26T10:00:00Z");
  const ago = (ms: number) => new Date(now - ms);

  it("is hot right after an interaction and for the whole window", async () => {
    const { isHot, HOT_WINDOW_MS } = await import("./agentProtocol");
    expect(isHot(ago(0), now)).toBe(true);
    expect(isHot(ago(30_000), now)).toBe(true);
    expect(isHot(ago(HOT_WINDOW_MS), now)).toBe(true);
  });

  it("goes cold after the window, and when nobody ever used the page", async () => {
    const { isHot, HOT_WINDOW_MS } = await import("./agentProtocol");
    expect(isHot(ago(HOT_WINDOW_MS + 1), now)).toBe(false);
    expect(isHot(null, now)).toBe(false);
    expect(isHot(undefined, now)).toBe(false);
  });

  it("tolerates a little clock skew but not a timestamp far in the future", async () => {
    const { isHot } = await import("./agentProtocol");
    expect(isHot(new Date(now + 2_000), now)).toBe(true);
    expect(isHot(new Date(now + 60_000), now)).toBe(false);
  });
});
