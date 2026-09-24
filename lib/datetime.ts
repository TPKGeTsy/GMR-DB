// All check-in/booking/leave timestamps are stored as UTC instants (Prisma
// DateTime). Formatting them with the ambient server timezone is wrong: in
// production the server runs in UTC, not Thailand's, so times were showing
// up to 7 hours off. Every display helper here pins Asia/Bangkok explicitly
// so the output is correct regardless of where the code runs.
const BANGKOK_TZ = "Asia/Bangkok";

export function formatThaiDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("th-TH", { timeZone: BANGKOK_TZ });
}

export function formatThaiDateLong(date: Date | string): string {
  return new Date(date).toLocaleDateString("th-TH", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: BANGKOK_TZ,
  });
}

export function formatThaiTime(date: Date | string): string {
  return new Date(date).toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: BANGKOK_TZ,
  });
}

export function formatThaiDateTime(date: Date | string): string {
  return new Date(date).toLocaleString("th-TH", { timeZone: BANGKOK_TZ });
}

/** YYYY-MM-DD calendar day in Thailand time — used to group check-ins by
 *  business day regardless of the server's own timezone. */
export function bangkokDateKey(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: BANGKOK_TZ });
}

/** The instant corresponding to `hour:minute` Bangkok time on the same
 *  Bangkok calendar day as `date` — e.g. backdating an auto check-out to
 *  "18:00 that day" regardless of what time it actually runs. Bangkok has
 *  no DST, so a fixed +07:00 offset is always correct. */
export function bangkokDateAt(date: Date, hour: number, minute = 0): Date {
  const dateKey = bangkokDateKey(date);
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return new Date(`${dateKey}T${hh}:${mm}:00+07:00`);
}

/** The [start, end) instant range covering an entire Bangkok calendar day
 *  (e.g. "2026-09-15") — for querying "everything that happened on this
 *  day" regardless of the server's own timezone. */
export function bangkokDayRange(dateKey: string): { start: Date; end: Date } {
  const start = new Date(`${dateKey}T00:00:00+07:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

// buildDailySummary needs a full IN→OUT pair to compute a day's hours, so a
// session that starts just before `from` or crosses past `to` still needs
// its other half fetched. 3 days of padding is generous headroom past any
// real session length seen in this app's data (the longest on record is
// ~27h) without falling back to an unbounded table scan, which is what
// fetching a user's *entire* check-in history (the pattern this replaces)
// amounts to once the table has months of data in it.
const CHECKIN_WINDOW_PADDING_DAYS = 3;

/** A `createdAt` filter wide enough to correctly pair any session touching
 *  [from, to], for report queries that used to fetch a user's whole
 *  check-in history just to get the boundary sessions right. Returns {}
 *  (no bound) when neither `from` nor `to` is given, preserving true
 *  all-time behavior for callers that intend it (e.g. CSV export). */
export function paddedCheckInWindow(from?: string, to?: string): { gte?: Date; lt?: Date } {
  if (!from && !to) return {};
  const filter: { gte?: Date; lt?: Date } = {};
  if (from) {
    filter.gte = new Date(bangkokDayRange(from).start.getTime() - CHECKIN_WINDOW_PADDING_DAYS * 24 * 60 * 60 * 1000);
  }
  const toKey = to || bangkokDateKey(new Date());
  filter.lt = new Date(bangkokDayRange(toKey).end.getTime() + CHECKIN_WINDOW_PADDING_DAYS * 24 * 60 * 60 * 1000);
  return filter;
}
