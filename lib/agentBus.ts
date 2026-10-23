// In-process "something changed" signals between the web app's request
// handlers, so the Raspberry Pi agent hears about a button press immediately
// instead of on its next poll:
//
//   - `desired`: the saved switch states changed (a user pressed a button).
//     The agent's long-poll on /api/modbus-agent/desired is parked here.
//   - `report`: the agent posted a fresh module state. The server action that
//     is waiting for the Pi to confirm a switch is parked here.
//
// Route handlers and server actions can be bundled separately, so the waiter
// sets live on `globalThis` — one shared copy per Node process. This only
// helps when both sides run in the same process (the company server under
// PM2); across processes (e.g. Vercel + the company server) it is a no-op and
// callers fall back to short database polls, so nothing depends on it.

type Waiter = () => void;
type Channel = "desired" | "report";

interface Bus {
  desired: Set<Waiter>;
  report: Set<Waiter>;
}

const g = globalThis as unknown as { __gmrAgentBus?: Bus };
const bus: Bus = (g.__gmrAgentBus ??= { desired: new Set(), report: new Set() });

function notify(channel: Channel) {
  for (const wake of [...bus[channel]]) wake();
}

function wait(channel: Channel, timeoutMs: number): Promise<"signal" | "timeout"> {
  return new Promise((resolve) => {
    const finish = (how: "signal" | "timeout") => {
      clearTimeout(timer);
      bus[channel].delete(onSignal);
      resolve(how);
    };
    const onSignal: Waiter = () => finish("signal");
    const timer = setTimeout(() => finish("timeout"), Math.max(0, timeoutMs));
    bus[channel].add(onSignal);
  });
}

/** The saved switch states were just written to the database. */
export const notifyDesiredChanged = () => notify("desired");
/** The agent just stored a fresh report. */
export const notifyReported = () => notify("report");

/** Resolves as soon as the desired state changes, or after `timeoutMs`. */
export const waitForDesiredChange = (timeoutMs: number) => wait("desired", timeoutMs);
/** Resolves as soon as the agent reports, or after `timeoutMs`. */
export const waitForReport = (timeoutMs: number) => wait("report", timeoutMs);

/** Number of parked waiters (for tests / diagnostics). */
export const waiterCount = (channel: Channel) => bus[channel].size;
