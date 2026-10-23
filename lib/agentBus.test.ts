import { describe, expect, it } from "vitest";
import { notifyDesiredChanged, notifyReported, waitForDesiredChange, waitForReport, waiterCount } from "./agentBus";

describe("agentBus", () => {
  it("wakes a parked waiter immediately on notify", async () => {
    const started = Date.now();
    const pending = waitForDesiredChange(5000);
    expect(waiterCount("desired")).toBe(1);
    notifyDesiredChanged();
    await expect(pending).resolves.toBe("signal");
    expect(Date.now() - started).toBeLessThan(500);
    expect(waiterCount("desired")).toBe(0);
  });

  it("times out when nothing happens, and cleans up after itself", async () => {
    await expect(waitForReport(30)).resolves.toBe("timeout");
    expect(waiterCount("report")).toBe(0);
  });

  it("wakes every parked waiter, and only on its own channel", async () => {
    const a = waitForDesiredChange(5000);
    const b = waitForDesiredChange(5000);
    const other = waitForReport(60);
    notifyDesiredChanged();
    await expect(Promise.all([a, b])).resolves.toEqual(["signal", "signal"]);
    await expect(other).resolves.toBe("timeout");
  });

  it("a notify with nobody waiting is harmless", () => {
    expect(() => {
      notifyDesiredChanged();
      notifyReported();
    }).not.toThrow();
  });
});
