// "Why did you stay for OT?" - asked at check-out after a long day.

/** Ask for the reason once the day's worked hours pass 8 h 30 min. */
export const OT_REASON_PROMPT_HOURS = 8.5;
export const MAX_OT_REASON_LENGTH = 300;

export function shouldAskOtReason(workedHours: number): boolean {
  return workedHours > OT_REASON_PROMPT_HOURS;
}

/** Trims; null when empty. Over-long text is cut rather than rejected. */
export function cleanOtReason(raw: string | null | undefined): string | null {
  const text = raw?.trim().replace(/\s+/g, " ") ?? "";
  return text ? text.slice(0, MAX_OT_REASON_LENGTH) : null;
}
