// Pure helpers for the Modbus module addresses that can be edited on the
// /modbus page. No server imports: the web app, the Pi agent, the client form
// and the tests all use these.

export interface ModuleOverride {
  host: string;
  port: number;
  unitId: number;
}

export const DEFAULT_PORT = 502;
export const DEFAULT_UNIT_ID = 1;

function ipv4Octets(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const octets = m.slice(1).map(Number);
  return octets.every((o) => o >= 0 && o <= 255) ? octets : null;
}

/**
 * Only private LAN addresses are accepted (10.x, 172.16-31.x, 192.168.x). The
 * server opens a TCP connection to whatever is entered here, so it must not
 * be possible to point it at arbitrary hosts on the internet.
 */
export function isPrivateIPv4(host: string): boolean {
  const o = ipv4Octets(host);
  if (!o) return false;
  return o[0] === 10 || (o[0] === 172 && o[1] >= 16 && o[1] <= 31) || (o[0] === 192 && o[1] === 168);
}

export type ValidationResult = { ok: true; value: ModuleOverride } | { ok: false; error: string };

/** Validate what the form submits (all fields arrive as strings or numbers). */
export function validateModuleSettings(input: { host?: unknown; port?: unknown; unitId?: unknown }): ValidationResult {
  const host = typeof input.host === "string" ? input.host.trim() : "";
  if (!host) return { ok: false, error: "กรุณาใส่ IP ของโมดูล" };
  if (!ipv4Octets(host)) return { ok: false, error: "IP ไม่ถูกต้อง (ตัวอย่าง 192.168.1.12)" };
  if (!isPrivateIPv4(host)) {
    return { ok: false, error: "ใช้ได้เฉพาะ IP ภายในองค์กร (10.x.x.x, 172.16–31.x.x, 192.168.x.x)" };
  }

  const port = input.port === "" || input.port == null ? DEFAULT_PORT : Number(input.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, error: "พอร์ตต้องเป็นเลข 1–65535" };
  }

  const unitId = input.unitId === "" || input.unitId == null ? DEFAULT_UNIT_ID : Number(input.unitId);
  if (!Number.isInteger(unitId) || unitId < 0 || unitId > 255) {
    return { ok: false, error: "Unit ID ต้องเป็นเลข 0–255" };
  }

  return { ok: true, value: { host, port, unitId } };
}

/**
 * Coerce a stored / downloaded list of module settings into one entry per
 * module (null = not set). Anything malformed counts as "not set" rather than
 * being trusted — the Pi must never connect to an address it couldn't validate.
 */
export function normalizeOverrides(value: unknown, moduleCount: number): (ModuleOverride | null)[] {
  const arr = Array.isArray(value) ? value : [];
  return Array.from({ length: moduleCount }, (_, m) => {
    const v = arr[m];
    if (typeof v !== "object" || v === null) return null;
    const checked = validateModuleSettings(v as { host?: unknown; port?: unknown; unitId?: unknown });
    return checked.ok ? checked.value : null;
  });
}

export function sameOverride(a: ModuleOverride | null | undefined, b: ModuleOverride | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return a.host === b.host && a.port === b.port && a.unitId === b.unitId;
}
