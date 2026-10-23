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

/** Which module (0-based) a global channel lives on. */
export function moduleOfChannel(channel: number): number {
  return Math.floor(channel / COILS_PER_MODULE);
}

/** The coil address of a global channel within its own module. */
export function localCoil(channel: number): number {
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
export function displayStates(live: boolean[], modules: ModuleStatus[], saved: SavedStates): boolean[] {
  return live.map((on, channel) => (modules[moduleOfChannel(channel)]?.online ? on : (saved[channel] ?? false)));
}

/** Like findMismatches, but ignores channels whose module isn't reachable (nothing to compare). */
export function restorableMismatches(device: boolean[], modules: ModuleStatus[], saved: SavedStates): number[] {
  return findMismatches(device, saved).filter((channel) => modules[moduleOfChannel(channel)]?.online);
}

/** Thai explanation of why a module is unavailable, or null when it's online. */
export function describeModuleStatus(moduleIndex: number, status: ModuleStatus | undefined): string | null {
  if (status?.online) return null;
  const n = moduleIndex + 1;
  if (status && !status.configured) return `โมดูล ${n} ยังไม่ได้ตั้งค่า (ใส่ IP ในหน้านี้ หรือที่ MODBUS_HOST_${n})`;
  return `ติดต่อโมดูล ${n} ไม่ได้`;
}
