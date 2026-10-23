import { afterEach, describe, expect, it, vi } from "vitest";
import { createSupervisor, type SupervisorDeps } from "./relaySupervisor";
import { desiredStates, findMismatches, type SavedStates } from "./relayState";

// A tiny fake module + database: reconcile() behaves like the real one
// (fix whatever differs from the desired state) against an in-memory device.
function setup(opts: { desired?: SavedStates; device?: boolean[]; refreshMs?: number } = {}) {
  const device = opts.device ?? [false, false, false, false];
  let clock = 0;
  const calls = { load: 0, reconcile: 0 };
  const onRestore = vi.fn();
  const onError = vi.fn();

  const deps: SupervisorDeps = {
    channelCount: 4,
    loadDesired: async () => {
      calls.load++;
      return opts.desired ?? [null, null, null, null];
    },
    reconcile: async (getDesired) => {
      calls.reconcile++;
      const desired = getDesired();
      const restored = findMismatches(device, desired);
      if (restored.length) device.splice(0, device.length, ...desiredStates(device, desired));
      return { restored };
    },
    intervalMs: 1000,
    refreshMs: opts.refreshMs ?? 60_000,
    onRestore,
    onError,
    now: () => clock,
  };
  return { sup: createSupervisor(deps), device, calls, onRestore, onError, advance: (ms: number) => (clock += ms) };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("relay supervisor", () => {
  it("re-applies saved-ON channels the module has lost", async () => {
    const { sup, device, onRestore } = setup({ desired: [true, null, false, null] });
    await sup.tick();
    expect(device).toEqual([true, false, false, false]);
    expect(onRestore).toHaveBeenCalledWith([0]);
  });

  it("does nothing when no channel has a saved state", async () => {
    const { sup, calls } = setup({ desired: [null, null, null, null], device: [true, true, false, false] });
    await sup.tick();
    expect(calls.reconcile).toBe(0);
  });

  it("switches a channel OFF when the saved state says OFF", async () => {
    const { sup, device, onRestore } = setup({ desired: [false, null, null, null], device: [true, true, false, false] });
    await sup.tick();
    expect(device).toEqual([false, true, false, false]); // unsaved channel 1 left alone
    expect(onRestore).toHaveBeenCalledWith([0]);
  });

  it("reports a module that can't be reached but still reports what it restored elsewhere", async () => {
    const onError = vi.fn();
    const onRestore = vi.fn();
    const sup = createSupervisor({
      channelCount: 4,
      loadDesired: async () => [true, null, null, null],
      reconcile: async () => ({ restored: [0], errors: [null, new Error("module 2 down")] }),
      intervalMs: 1000,
      refreshMs: 60_000,
      onError,
      onRestore,
    });
    await sup.tick();
    expect(onError).toHaveBeenCalledWith("supervisor module 2", expect.any(Error));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onRestore).toHaveBeenCalledWith([0]);
  });

  it("stays quiet when the module already matches", async () => {
    const { sup, onRestore } = setup({ desired: [true, null, null, null], device: [true, false, false, false] });
    await sup.tick();
    expect(onRestore).not.toHaveBeenCalled();
  });

  it("changes the desired state before the work runs, and undoes it if the work fails", async () => {
    const { sup } = setup({ desired: [true, null, null, null] });
    await sup.ready();

    let seenDuringWork: SavedStates = [];
    await sup.applyChange(0, false, async () => {
      seenDuringWork = [...sup.getDesired()];
    });
    expect(seenDuringWork[0]).toBe(false);
    expect(sup.getDesired()[0]).toBe(false);

    await expect(
      sup.applyChange(0, true, async () => {
        throw new Error("module unreachable");
      })
    ).rejects.toThrow("module unreachable");
    expect(sup.getDesired()[0]).toBe(false); // reverted to what it was before
  });

  it("does not let a supervisor check undo a switch the user just made", async () => {
    // Device is ON, desired says ON; the user turns channel 0 OFF. While the
    // work is still in flight a check runs: it must see desired=OFF and agree.
    const { sup, device } = setup({ desired: [true, null, null, null], device: [true, false, false, false] });
    await sup.ready();
    await sup.applyChange(0, false, async () => {
      device[0] = false; // the module is switched OFF...
      await sup.tick(); // ...and a check lands before the work (DB save) finishes
    });
    expect(device[0]).toBe(false);
    expect(sup.getDesired()[0]).toBe(false);
  });

  it("restores a channel after the module loses it, even with another already ON", async () => {
    // Module lost power: everything OFF. Channel 0 is desired ON, channel 2 desired OFF.
    const { sup, device } = setup({ desired: [true, null, false, null], device: [false, false, true, false] });
    await sup.tick();
    expect(device).toEqual([true, false, false, false]);
  });

  it("keeps a switch made while the database was still loading", async () => {
    let release!: (v: SavedStates) => void;
    const slowLoad = new Promise<SavedStates>((r) => (release = r));
    const sup = createSupervisor({
      channelCount: 4,
      loadDesired: () => slowLoad,
      reconcile: async () => ({ restored: [] }),
      intervalMs: 1000,
      refreshMs: 60_000,
    });
    const ready = sup.ready();
    await sup.applyChange(1, true, async () => {});
    release([null, null, null, null]); // stale: predates the switch
    await ready;
    expect(sup.getDesired()[1]).toBe(true);
  });

  it("refreshes from the database only after refreshMs", async () => {
    const { sup, calls, advance } = setup({ desired: [null, null, null, null] });
    await sup.tick();
    advance(1_000);
    await sup.tick();
    expect(calls.load).toBe(1);
    advance(60_000);
    await sup.tick();
    expect(calls.load).toBe(2);
  });

  it("survives errors and never overlaps checks", async () => {
    let resolveFirst!: () => void;
    let n = 0;
    const onError = vi.fn();
    const sup = createSupervisor({
      channelCount: 4,
      loadDesired: async () => [true, null, null, null],
      reconcile: async () => {
        n++;
        if (n === 1) await new Promise<void>((r) => (resolveFirst = r)); // hangs: module slow
        if (n === 2) throw new Error("boom");
        return { restored: [] };
      },
      intervalMs: 1000,
      refreshMs: 60_000,
      onError,
    });

    const first = sup.tick();
    await sup.tick(); // overlapping call returns immediately without a second reconcile
    await vi.waitFor(() => expect(n).toBe(1));
    resolveFirst();
    await first;

    await sup.tick(); // n === 2 -> throws, reported, not fatal
    expect(onError).toHaveBeenCalledWith("supervisor tick", expect.any(Error));
    await sup.tick(); // n === 3 -> fine again
    expect(n).toBe(3);
  });

  it("checks on a timer once started and stops when asked", async () => {
    vi.useFakeTimers();
    const { sup, calls } = setup({ desired: [true, null, null, null] });
    sup.start();
    expect(sup.isRunning()).toBe(true);
    await vi.advanceTimersByTimeAsync(3_500);
    expect(calls.reconcile).toBeGreaterThanOrEqual(3);

    sup.stop();
    const after = calls.reconcile;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(calls.reconcile).toBe(after);
    expect(sup.isRunning()).toBe(false);
  });
});
