// Pure helpers for comparing what the relay module reports with what the web
// app last told it to do. No server imports — the client panel uses these too.

// Two ETH-Modbus-IO16T modules with 16 channels each. Channels are numbered
// globally: 0-15 live on module 1, 16-31 on module 2 (channel number = index + 1,
// so CH1-CH16 / CH17-CH32). Module 2 may not be installed yet — its IP is
// filled in later (MODBUS_HOST_2) and until then its channels are unavailable.
export const COILS_PER_MODULE = 16;
export const MODULE_COUNT = 2;
/** Total channels across all modules. */
export const COIL_COUNT = COILS_PER_MODULE * MODULE_COUNT;

/** Where a channel's output physically is: which module, and which coil address on it (0-15). */
export interface ChannelLocation {
  module: number;
  address: number;
}

/** One entry per channel (index = global channel). Every (module, address) pair is used at most once. */
export type ChannelMap = ChannelLocation[];

/**
 * The wiring a fresh install starts with: channel n sits at the next free coil,
 * module by module (channels 0-15 -> module 1 addresses 0-15, 16-31 -> module 2).
 * The /modbus page can rewire any channel; see swapIntoLocation().
 */
export function defaultChannelMap(): ChannelMap {
  return Array.from({ length: COIL_COUNT }, (_, channel) => ({
    module: Math.floor(channel / COILS_PER_MODULE),
    address: channel % COILS_PER_MODULE,
  }));
}

const isLocation = (v: unknown): v is ChannelLocation =>
  typeof v === "object" &&
  v !== null &&
  Number.isInteger((v as ChannelLocation).module) &&
  (v as ChannelLocation).module >= 0 &&
  (v as ChannelLocation).module < MODULE_COUNT &&
  Number.isInteger((v as ChannelLocation).address) &&
  (v as ChannelLocation).address >= 0 &&
  (v as ChannelLocation).address < COILS_PER_MODULE;

/** Why a map is unusable (out of range, wrong length, two channels on one output), or null when it is fine. */
export function validateChannelMap(map: unknown): string | null {
  if (!Array.isArray(map) || map.length !== COIL_COUNT) return `ต้องมี ${COIL_COUNT} ช่อง`;
  const seen = new Set<string>();
  for (let channel = 0; channel < map.length; channel++) {
    const loc = map[channel];
    if (!isLocation(loc)) return `ช่อง ${channel + 1} มีที่อยู่ไม่ถูกต้อง`;
    const key = `${loc.module}:${loc.address}`;
    if (seen.has(key)) return `มีมากกว่าหนึ่งช่องใช้โมดูล ${loc.module + 1} address ${loc.address} ซ้ำกัน`;
    seen.add(key);
  }
  return null;
}

/**
 * Coerce a stored / downloaded map into a usable one. Anything malformed or
 * conflicting falls back to the default wiring as a whole — a half-trusted map
 * could switch the wrong output, which is worse than the known default.
 */
export function normalizeChannelMap(value: unknown): ChannelMap {
  if (validateChannelMap(value) === null) {
    return (value as ChannelLocation[]).map((l) => ({ module: l.module, address: l.address }));
  }
  return defaultChannelMap();
}

export function sameChannelMap(a: ChannelMap, b: ChannelMap): boolean {
  return a.length === b.length && a.every((l, i) => l.module === b[i].module && l.address === b[i].address);
}

/** The channel wired to (module, address), or -1 when none is. */
export function channelAt(map: ChannelMap, module: number, address: number): number {
  return map.findIndex((l) => l.module === module && l.address === address);
}

export interface SwapResult {
  map: ChannelMap;
  /** The channel that was already at the target and moved to `channel`'s old place (null if none). */
  displaced: number | null;
}

/**
 * Wire `channel` to (module, address). That output may already belong to
 * another channel; the two simply trade places, so the map always stays
 * conflict-free. Returns the new map (the input is not modified).
 */
export function swapIntoLocation(map: ChannelMap, channel: number, module: number, address: number): SwapResult {
  const target: ChannelLocation = { module, address };
  if (!isLocation(target)) throw new RangeError("module/address out of range");
  if (!Number.isInteger(channel) || channel < 0 || channel >= map.length) throw new RangeError("channel out of range");
  const next = map.map((l) => ({ ...l }));
  const other = channelAt(next, module, address);
  if (other === channel) return { map: next, displaced: null };
  const previous = { ...next[channel] };
  next[channel] = target;
  if (other !== -1) next[other] = previous;
  return { map: next, displaced: other === -1 ? null : other };
}

/** Which module (0-based) a global channel lives on (default wiring when no map is given). */
export function moduleOfChannel(channel: number, map?: ChannelMap): number {
  if (map) return map[channel]?.module ?? -1;
  return Math.floor(channel / COILS_PER_MODULE);
}

/** The coil address of a global channel within its own module (default wiring when no map is given). */
export function localCoil(channel: number, map?: ChannelMap): number {
  if (map) return map[channel]?.address ?? -1;
  return channel % COILS_PER_MODULE;
}

/** Whether a module has an address configured, and whether it answered. */
export interface ModuleStatus {
  configured: boolean;
  online: boolean;
}

/** Saved state per channel; null = this channel was never switched from the web. */
export type SavedStates = (boolean | null)[];

export function savedFromRows(rows: { channel: number; isOn: boolean }[], channelCount: number): SavedStates {
  const saved: SavedStates = new Array(channelCount).fill(null);
  for (const row of rows) {
    if (Number.isInteger(row.channel) && row.channel >= 0 && row.channel < channelCount) {
      saved[row.channel] = row.isOn;
    }
  }
  return saved;
}

/** Channels where the module disagrees with the saved state (0-based). */
export function findMismatches(device: boolean[], saved: SavedStates): number[] {
  const out: number[] = [];
  for (let i = 0; i < device.length; i++) {
    const want = saved[i];
    if (want !== null && want !== undefined && want !== device[i]) out.push(i);
  }
  return out;
}

/** What the module should look like: saved wins where it exists, else keep as is. */
export function desiredStates(device: boolean[], saved: SavedStates): boolean[] {
  return device.map((on, i) => saved[i] ?? on);
}

/** Best-guess display state when the module can't be reached: saved, else OFF. */
export function statesFromSaved(saved: SavedStates): boolean[] {
  return saved.map((s) => s ?? false);
}

export function hasAnySaved(saved: SavedStates): boolean {
  return saved.some((s) => s !== null);
}

/** Live state for modules that answered, the saved copy for the ones that didn't. */
export function displayStates(live: boolean[], modules: ModuleStatus[], saved: SavedStates, map?: ChannelMap): boolean[] {
  return live.map((on, channel) => (modules[moduleOfChannel(channel, map)]?.online ? on : (saved[channel] ?? false)));
}

/** Like findMismatches, but ignores channels whose module isn't reachable (nothing to compare). */
export function restorableMismatches(device: boolean[], modules: ModuleStatus[], saved: SavedStates, map?: ChannelMap): number[] {
  return findMismatches(device, saved).filter((channel) => modules[moduleOfChannel(channel, map)]?.online);
}

/** Thai explanation of why a module is unavailable, or null when it's online. */
export function describeModuleStatus(moduleIndex: number, status: ModuleStatus | undefined): string | null {
  if (status?.online) return null;
  const n = moduleIndex + 1;
  if (status && !status.configured) return `โมดูล ${n} ยังไม่ได้ตั้งค่า (ใส่ IP ในหน้านี้ หรือที่ MODBUS_HOST_${n})`;
  return `ติดต่อโมดูล ${n} ไม่ได้`;
}
