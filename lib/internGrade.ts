// Month-to-month intern grades: a person's pay grade can change on a given
// date (e.g. A until 31 Aug, A+ from 1 Sep). Pure helpers, no database.

export interface GradeChange {
  grade: string;
  /** "YYYY-MM-DD" Bangkok day the grade starts applying (inclusive). */
  effectiveFrom: string;
}

export const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function sorted(changes: GradeChange[]): GradeChange[] {
  return [...changes].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}

/** The grade that applies on `dateKey`: the latest change on or before it; a
 *  day before the first change uses the first change's grade (so the earliest
 *  entry also covers earlier work). Falls back to `fallback` with no history. */
export function gradeForDay(changes: GradeChange[], dateKey: string, fallback: string | null): string | null {
  if (changes.length === 0) return fallback;
  const list = sorted(changes);
  let current = list[0].grade;
  for (const c of list) {
    if (c.effectiveFrom <= dateKey) current = c.grade;
    else break;
  }
  return current;
}
