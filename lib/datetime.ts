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
