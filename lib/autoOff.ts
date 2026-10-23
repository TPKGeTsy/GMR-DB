import { bangkokDateAt } from "./datetime";

// Decides which outputs have been left ON too long and should be switched off
// by the cron job. Pure (no DB / Modbus access) so it can be tested.
//
// Two independent rules, either or both may be enabled:
//   - daily cutoff: every output still ON after HH:MM (Bangkok time) goes OFF
//   - max duration: an output ON continuously for N hours goes OFF
// "ON since" is the saved row's updatedAt — i.e. when someone last switched
// that channel from the web.

export interface AutoOffConfig {
  /** Max continuous ON time in ms, or null = rule disabled. */
  maxOnMs: number | null;
  /** Daily cutoff in Bangkok time, or null = rule disabled. */
  dailyOff: { hour: number; minute: number } | null;
}

export const DEFAULT_DAILY_OFF = "20:00";

/**
 * MODBUS_AUTO_OFF_TIME  "HH:MM" Bangkok time (default 20:00); "off" disables
 * MODBUS_AUTO_OFF_HOURS max continuous ON hours; unset / 0 disables
 */
export function parseAutoOffConfig(env: Record<string, string | undefined>): AutoOffConfig {
  const rawTime = (env.MODBUS_AUTO_OFF_TIME ?? DEFAULT_DAILY_OFF).trim().toLowerCase();
  let dailyOff: AutoOffConfig["dailyOff"] = null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(rawTime);
  if (m) {
    const hour = Number(m[1]);
    const minute = Number(m[2]);
    if (hour <= 23 && minute <= 59) dailyOff = { hour, minute };
  }

  const hours = Number(env.MODBUS_AUTO_OFF_HOURS);
  const maxOnMs = Number.isFinite(hours) && hours > 0 ? hours * 3_600_000 : null;

  return { maxOnMs, dailyOff };
}

export interface SavedRow {
  channel: number;
  isOn: boolean;
  updatedAt: Date;
}

/** The first daily cutoff strictly after `since`. */
function nextCutoffAfter(since: Date, { hour, minute }: { hour: number; minute: number }): Date {
  const sameDay = bangkokDateAt(since, hour, minute);
  return sameDay > since ? sameDay : new Date(sameDay.getTime() + 24 * 3_600_000);
}

/**
 * Channels (0-based) that are ON right now and should be switched OFF.
 * Only channels the web turned on (a saved row with isOn) and that the
 * module still reports ON are considered.
 */
export function channelsDueForAutoOff(
  device: boolean[],
  rows: SavedRow[],
  now: Date,
  config: AutoOffConfig
): number[] {
  const due: number[] = [];
  for (const row of rows) {
    if (!row.isOn || !device[row.channel]) continue;

    const tooLong = config.maxOnMs !== null && now.getTime() - row.updatedAt.getTime() >= config.maxOnMs;
    const pastCutoff = config.dailyOff !== null && now >= nextCutoffAfter(row.updatedAt, config.dailyOff);
    if (tooLong || pastCutoff) due.push(row.channel);
  }
  return due.sort((a, b) => a - b);
}

export function isAutoOffEnabled(config: AutoOffConfig): boolean {
  return config.maxOnMs !== null || config.dailyOff !== null;
}

/** Thai sentence for the page, e.g. "ปิดอัตโนมัติทุกวันเวลา 20:00 และเมื่อเปิดต่อเนื่องเกิน 10 ชั่วโมง". */
export function describeAutoOff(config: AutoOffConfig): string | null {
  const parts: string[] = [];
  if (config.dailyOff) {
    const hh = String(config.dailyOff.hour).padStart(2, "0");
    const mm = String(config.dailyOff.minute).padStart(2, "0");
    parts.push(`ทุกวันเวลา ${hh}:${mm}`);
  }
  if (config.maxOnMs !== null) {
    parts.push(`เมื่อเปิดต่อเนื่องเกิน ${config.maxOnMs / 3_600_000} ชั่วโมง`);
  }
  return parts.length ? `ปิดเอาต์พุตที่ลืมปิดให้อัตโนมัติ ${parts.join(" และ ")}` : null;
}
