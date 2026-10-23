import ModbusRTU from "modbus-serial";
import {
  COILS_PER_MODULE,
  COIL_COUNT,
  MODULE_COUNT,
  desiredStates,
  findMismatches,
  localCoil,
  moduleOfChannel,
  type ModuleStatus,
  type SavedStates,
} from "./relayState";
import { sameOverride, type ModuleOverride } from "./moduleSettings";

// Defined in relayState (no Modbus dependency) so web routes can use them too.
export { COIL_COUNT, COILS_PER_MODULE, MODULE_COUNT };

// Gateway to the ETH-Modbus-IO16T I/O modules (transistor outputs, not relay
// contacts). Two modules, 16 coils each; channels are numbered globally
// (0-15 module 1, 16-31 module 2) and coils 0-15 on a module are its channels
// 1-16 (verified on the real device). Server-only: import from server actions
// / route handlers, never from a client component.
//
// Each module has ONE shared connection and a FIFO queue. These modules only
// accept a handful of TCP clients and answer one request at a time, so letting
// every web request open its own socket would make them step on each other.
// Modules are independent: one being unplugged (or not installed yet) never
// affects the other.
//
// KEEP-ALIVE: the module has a communication watchdog — measured on the real
// device, an output switched ON drops back OFF if no Modbus request arrives
// for about 2 seconds (it stays ON with requests every <= 1.75 s, and a quiet
// but open TCP connection is not enough). So while any channel of a module is
// ON we poll that module every MODBUS_KEEPALIVE_MS (default 500 ms); that
// polling is what makes an output "stay on". It stops by itself once the
// module is all OFF.

interface ModuleConfig {
  /** null = this module isn't configured (yet). */
  host: string | null;
  port: number;
  unitId: number;
  timeoutMs: number;
  /** 0 disables the keep-alive (outputs will then drop after ~2 s). */
  keepAliveMs: number;
}

// Addresses entered on the /modbus page (stored in the database) beat the env
// vars. They're pushed in with setModuleOverrides() — by the web server after
// reading the database, or by the Pi agent after downloading them — so this
// file itself never touches the database.
const og = globalThis as unknown as { __modbusOverrides?: (ModuleOverride | null)[] };
const overrides: (ModuleOverride | null)[] = (og.__modbusOverrides ??= new Array(MODULE_COUNT).fill(null));

/**
 * Replace the page-configured addresses (null = not set, use env/default). A
 * module whose address changed gets its old connection closed so the next
 * request connects to the new one.
 */
export function setModuleOverrides(next: (ModuleOverride | null)[]): void {
  for (let m = 0; m < MODULE_COUNT; m++) {
    const incoming = next[m] ?? null;
    if (!sameOverride(overrides[m], incoming)) {
      overrides[m] = incoming;
      dropClient(m);
    }
  }
}

// Module 1 reads MODBUS_HOST / _PORT / _UNIT_ID (default host: the module's
// current address). Module 2 reads MODBUS_HOST_2 and has NO default host —
// until it's set, module 2 counts as not installed. Its port/unit default to
// module 1's. A page-configured address (see above) wins over all of this.
function moduleConfig(m: number): ModuleConfig {
  const timeoutMs = Number(process.env.MODBUS_TIMEOUT_MS ?? 2000);
  const keepAliveMs = Number(process.env.MODBUS_KEEPALIVE_MS ?? 500);
  const override = overrides[m];
  if (override) return { host: override.host, port: override.port, unitId: override.unitId, timeoutMs, keepAliveMs };

  const suffix = m === 0 ? "" : `_${m + 1}`;
  const host = (process.env[`MODBUS_HOST${suffix}`] ?? (m === 0 ? "192.168.1.12" : "")).trim();
  return {
    host: host || null,
    port: Number(process.env[`MODBUS_PORT${suffix}`] ?? process.env.MODBUS_PORT ?? 502),
    unitId: Number(process.env[`MODBUS_UNIT_ID${suffix}`] ?? process.env.MODBUS_UNIT_ID ?? 1),
    timeoutMs,
    keepAliveMs,
  };
}

export function isModuleConfigured(m: number): boolean {
  return moduleConfig(m).host !== null;
}

/** The address a module is using right now, and where that came from. */
export function effectiveModuleAddress(m: number): {
  host: string | null;
  port: number;
  unitId: number;
  source: "page" | "env" | "default" | "none";
} {
  const { host, port, unitId } = moduleConfig(m);
  const suffix = m === 0 ? "" : `_${m + 1}`;
  const source = overrides[m]
    ? "page"
    : !host
      ? "none"
      : process.env[`MODBUS_HOST${suffix}`]?.trim()
        ? "env"
        : "default";
  return { host, port, unitId, source };
}

type ModuleState = {
  client: ModbusRTU | null;
  queue: Promise<unknown>;
  keepAlive?: ReturnType<typeof setInterval> | null;
  keepAliveBusy?: boolean;
};

// Kept on globalThis so `next dev` hot reloads don't leak a socket per edit.
const g = globalThis as unknown as { __modbusModules?: ModuleState[] };
const modules: ModuleState[] = (g.__modbusModules ??= Array.from({ length: MODULE_COUNT }, () => ({
  client: null,
  queue: Promise.resolve(),
})));

export function isValidCoilIndex(index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < COIL_COUNT;
}

function dropClient(m: number) {
  const client = modules[m].client;
  modules[m].client = null;
  if (client) {
    try {
      client.close(() => {});
    } catch {
      /* already closed */
    }
  }
}

async function getClient(m: number): Promise<ModbusRTU> {
  const state = modules[m];
  if (state.client?.isOpen) return state.client;
  dropClient(m);
  const { host, port, unitId, timeoutMs } = moduleConfig(m);
  if (!host) throw new Error(`Module ${m + 1} is not configured (set MODBUS_HOST_${m + 1})`);
  const client = new ModbusRTU();
  client.setTimeout(timeoutMs);
  await client.connectTCP(host, { port });
  client.setID(unitId);
  state.client = client;
  return client;
}

// Runs `fn` on module `m` after every earlier call on that module has
// finished. On failure the socket is dropped and the call retried once on a
// fresh connection — covers the device having closed an idle socket on us.
// Safe to retry because writing a coil to a given value is idempotent.
function run<T>(m: number, fn: (client: ModbusRTU) => Promise<T>): Promise<T> {
  const attempt = async (): Promise<T> => {
    try {
      return await fn(await getClient(m));
    } catch (firstError) {
      dropClient(m);
      try {
        return await fn(await getClient(m));
      } catch (error) {
        dropClient(m);
        throw error instanceof Error ? error : firstError;
      }
    }
  };
  const result = modules[m].queue.then(attempt);
  modules[m].queue = result.catch(() => undefined);
  return result;
}

function stopKeepAlive(m: number) {
  const state = modules[m];
  if (state.keepAlive) clearInterval(state.keepAlive);
  state.keepAlive = null;
  state.keepAliveBusy = false;
}

function startKeepAlive(m: number) {
  const { keepAliveMs } = moduleConfig(m);
  const state = modules[m];
  if (state.keepAlive || !(keepAliveMs > 0)) return;
  state.keepAlive = setInterval(() => {
    // One keep-alive in flight at a time: if the module is unreachable the
    // connect attempt can outlast the interval, and requests must not pile up.
    if (state.keepAliveBusy) return;
    state.keepAliveBusy = true;
    readModule(m)
      .catch(() => {
        /* unreachable right now — try again next tick */
      })
      .finally(() => {
        state.keepAliveBusy = false;
      });
  }, keepAliveMs);
  // Never keep the process (or a test run) alive just for this timer.
  state.keepAlive.unref?.();
}

// Every read-back goes through here: any ON channel means that module's
// keep-alive must run, all OFF means it can stop.
function track(m: number, states: boolean[]): boolean[] {
  if (states.some(Boolean)) startKeepAlive(m);
  else stopKeepAlive(m);
  return states;
}

const toCoils = (data: unknown[]): boolean[] => data.slice(0, COILS_PER_MODULE).map(Boolean);

/** The 16 coils of one module (index 0 = its first channel). */
function readModule(m: number): Promise<boolean[]> {
  return run(m, async (client) => toCoils((await client.readCoils(0, COILS_PER_MODULE)).data)).then((s) => track(m, s));
}

export interface Snapshot {
  /** Global channel states (length COIL_COUNT); channels of an unreachable module read false. */
  states: boolean[];
  /** Per module: configured? answered? */
  modules: ModuleStatus[];
  /** Per module: why it failed, or null. */
  errors: (Error | null)[];
}

const allOff = () => new Array<boolean>(COILS_PER_MODULE).fill(false);
const asError = (e: unknown) => (e instanceof Error ? e : new Error(String(e)));

function snapshotOf(results: { configured: boolean; states: boolean[] | null; error: Error | null }[]): Snapshot {
  return {
    states: results.flatMap((r) => r.states ?? allOff()),
    modules: results.map((r) => ({ configured: r.configured, online: r.states !== null })),
    errors: results.map((r) => r.error),
  };
}

/** Read every module; one being down never fails the whole read. */
export async function readAllCoils(): Promise<Snapshot> {
  const results = await Promise.all(
    Array.from({ length: MODULE_COUNT }, async (_, m) => {
      if (!isModuleConfigured(m)) return { configured: false, states: null, error: null };
      try {
        return { configured: true, states: await readModule(m), error: null };
      } catch (error) {
        return { configured: true, states: null, error: asError(error) };
      }
    })
  );
  return snapshotOf(results);
}

/**
 * Switch one global channel and return the full state read back from the
 * modules. Rejects if that channel's module isn't configured or can't be reached.
 */
export async function setCoil(channel: number, on: boolean): Promise<Snapshot> {
  if (!isValidCoilIndex(channel)) throw new RangeError(`Channel index must be 0-${COIL_COUNT - 1}`);
  const m = moduleOfChannel(channel);
  if (!isModuleConfigured(m)) throw new Error(`Module ${m + 1} is not configured (set MODBUS_HOST_${m + 1})`);

  await run(m, async (client) => {
    await client.writeCoil(localCoil(channel), on);
    return toCoils((await client.readCoils(0, COILS_PER_MODULE)).data);
  }).then((s) => track(m, s));
  return readAllCoils();
}

/**
 * Set every channel of every reachable module (FC15, one request per module)
 * and return the read-back state. `states[i]` is global channel i; the array
 * must cover all COIL_COUNT channels. Modules that can't be reached are skipped.
 */
export async function writeAllCoils(states: boolean[]): Promise<Snapshot> {
  if (states.length !== COIL_COUNT) {
    throw new RangeError(`Expected ${COIL_COUNT} coil values, got ${states.length}`);
  }
  await Promise.all(
    Array.from({ length: MODULE_COUNT }, async (_, m) => {
      if (!isModuleConfigured(m)) return;
      const slice = states.slice(m * COILS_PER_MODULE, (m + 1) * COILS_PER_MODULE);
      try {
        await run(m, (client) => client.writeCoils(0, slice));
      } catch {
        /* reported as offline by the read-back below */
      }
    })
  );
  return readAllCoils();
}

/**
 * Compare each module with the desired (saved) state and re-apply the desired
 * one where they differ — per module, as ONE step in that module's request
 * queue, so the comparison and the write can't be interleaved with a user's
 * switch. `getDesired` is called inside that step, so it sees the latest
 * desired state. Returns the state after the call and the global channels
 * (0-based) it had to fix. An unreachable module is reported, not thrown.
 */
export async function reconcileCoils(getDesired: () => SavedStates): Promise<Snapshot & { restored: number[] }> {
  const restored: number[] = [];
  const results = await Promise.all(
    Array.from({ length: MODULE_COUNT }, async (_, m) => {
      if (!isModuleConfigured(m)) return { configured: false, states: null, error: null };
      try {
        const states = await run(m, async (client) => {
          const device = toCoils((await client.readCoils(0, COILS_PER_MODULE)).data);
          const desired = getDesired().slice(m * COILS_PER_MODULE, (m + 1) * COILS_PER_MODULE);
          const fix = findMismatches(device, desired);
          if (fix.length === 0) return device;
          await client.writeCoils(0, desiredStates(device, desired));
          restored.push(...fix.map((c) => c + m * COILS_PER_MODULE));
          return toCoils((await client.readCoils(0, COILS_PER_MODULE)).data);
        });
        return { configured: true, states: track(m, states), error: null };
      } catch (error) {
        return { configured: true, states: null, error: asError(error) };
      }
    })
  );
  // (a retried step may have recorded a channel twice)
  return { ...snapshotOf(results), restored: [...new Set(restored)].sort((a, b) => a - b) };
}

/** Whether a module's keep-alive loop is running (any module if omitted); for tests / diagnostics. */
export function isKeepAliveRunning(m?: number): boolean {
  return m === undefined ? modules.some((s) => !!s.keepAlive) : !!modules[m]?.keepAlive;
}

/** Close the shared sockets and stop the keep-alives (tests / graceful shutdown). */
export function closeModbus(): void {
  for (let m = 0; m < MODULE_COUNT; m++) {
    stopKeepAlive(m);
    dropClient(m);
  }
}
