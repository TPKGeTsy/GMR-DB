import type { SavedStates } from "./relayState";

// Keeps the I/O module matching what the database says it should be.
//
// The module forgets every output whenever it stops hearing from us (~2 s
// watchdog) — a server restart or a network blip switches the lights off even
// though the database still says they are ON. The supervisor notices the
// mismatch and re-applies the saved state. The DATABASE IS THE AUTHORITY: it
// is read at start-up and refreshed periodically, and channels the web
// switched are written to the in-memory copy first (see `applyChange`).
//
// Everything with side effects is injected (`deps`) so the logic is testable
// without a database or a real module; lib/relayRuntime.ts wires the real ones.

export interface SupervisorDeps {
  channelCount: number;
  /** Desired state from the database (null = never switched from the web). */
  loadDesired: () => Promise<SavedStates>;
  /**
   * Compare the modules with the desired state and fix them; returns the
   * 0-based channels it restored and, per module, why one couldn't be reached.
   */
  reconcile: (getDesired: () => SavedStates) => Promise<{ restored: number[]; errors?: (unknown | null)[] }>;
  /** How often to check the module while something is meant to be ON. */
  intervalMs: number;
  /** How often to re-read the desired state from the database. */
  refreshMs: number;
  onRestore?: (channels: number[]) => void;
  onError?: (scope: string, error: unknown) => void;
  now?: () => number;
}

export interface Supervisor {
  start(): void;
  stop(): void;
  isRunning(): boolean;
  /** One check cycle (the timer calls this; exposed for tests). */
  tick(): Promise<void>;
  getDesired(): SavedStates;
  /** Make sure the desired state has been loaded from the database. */
  ready(): Promise<void>;
  /**
   * Record that `channel` should now be `on`, run `work` (switching the module
   * and saving to the database), and undo the in-memory change if it throws.
   * The desired state changes BEFORE the module does, so a supervisor check
   * landing in between can't undo what the user just asked for.
   */
  applyChange<T>(channel: number, on: boolean, work: () => Promise<T>): Promise<T>;
  /** Replace the whole desired state (e.g. after a bulk restore). */
  setAll(desired: SavedStates): void;
}

export function createSupervisor(deps: SupervisorDeps): Supervisor {
  const now = deps.now ?? Date.now;
  let desired: SavedStates = new Array(deps.channelCount).fill(null);
  let loaded = false;
  let lastLoadAt = 0;
  let version = 0; // bumped on every local change, so a stale DB read can be discarded
  let timer: ReturnType<typeof setInterval> | null = null;
  let ticking = false;
  let loading: Promise<void> | null = null;

  const load = (): Promise<void> => {
    if (loading) return loading;
    const startedAt = version;
    loading = deps
      .loadDesired()
      .then((fromDb) => {
        // A change was made while we were reading: the DB copy may predate it.
        if (version === startedAt) desired = fromDb;
        loaded = true;
        lastLoadAt = now();
      })
      .catch((error) => deps.onError?.("supervisor load", error))
      .finally(() => {
        loading = null;
      });
    return loading;
  };

  const tick = async () => {
    if (ticking) return; // never overlap: an unreachable module can outlast the interval
    ticking = true;
    try {
      if (!loaded || now() - lastLoadAt >= deps.refreshMs) await load();
      // Nothing saved yet -> nothing to enforce. Otherwise enforce both ways:
      // restore what should be ON and switch off what the saved state says is
      // OFF (the Raspberry Pi agent relies on this to carry out web switches).
      if (!desired.some((v) => v !== null)) return;
      const result = await deps.reconcile(() => desired);
      // A module being down is reported, but the others were still handled.
      result.errors?.forEach((error, i) => {
        if (error) deps.onError?.(`supervisor module ${i + 1}`, error);
      });
      if (result.restored.length > 0) deps.onRestore?.(result.restored);
    } catch (error) {
      deps.onError?.("supervisor tick", error);
    } finally {
      ticking = false;
    }
  };

  return {
    start() {
      if (timer) return;
      timer = setInterval(() => void tick(), deps.intervalMs);
      timer.unref?.();
      void tick();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    isRunning: () => !!timer,
    tick,
    getDesired: () => desired,
    async ready() {
      if (!loaded) await load();
    },
    async applyChange(channel, on, work) {
      const previous = desired[channel];
      version++;
      desired = desired.map((v, i) => (i === channel ? on : v));
      try {
        return await work();
      } catch (error) {
        version++;
        desired = desired.map((v, i) => (i === channel ? previous : v));
        throw error;
      }
    },
    setAll(next) {
      version++;
      desired = [...next];
      loaded = true;
      lastLoadAt = now();
    },
  };
}
