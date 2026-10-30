// Lengths are stored and typed in millimetres everywhere (files always come in mm).
// This only changes how they are shown (and typed in the length column) on the plan page.

export const UNITS = {
  mm: { label: "มม.", factor: 1, decimals: 1 },
  cm: { label: "ซม.", factor: 10, decimals: 2 },
  m: { label: "ม.", factor: 1000, decimals: 3 },
  in: { label: "นิ้ว", factor: 25.4, decimals: 2 },
} as const;

export type Unit = keyof typeof UNITS;
export const UNIT_KEYS = Object.keys(UNITS) as Unit[];

export function isUnit(value: unknown): value is Unit {
  return typeof value === "string" && value in UNITS;
}

/** millimetres -> the unit, as a number. */
export function toUnit(mm: number, unit: Unit): number {
  return mm / UNITS[unit].factor;
}

/** A length typed in the unit -> millimetres. */
export function fromUnit(value: number, unit: Unit): number {
  return value * UNITS[unit].factor;
}

/** "1,910" - the number only, in the unit, with the digits that unit needs. */
export function formatLength(mm: number, unit: Unit): string {
  return toUnit(mm, unit).toLocaleString("th-TH", { maximumFractionDigits: UNITS[unit].decimals });
}

/** "1,910 มม." - with the unit written out. */
export function formatLengthWithUnit(mm: number, unit: Unit): string {
  return `${formatLength(mm, unit)} ${UNITS[unit].label}`;
}

/** The size of a piece of steel with units on every number: "50 มม. × 50 มม. × 4 มม." (x, y, thickness)
 *  or "Ø20 มม." for round bars and pipes. */
export function formatSection(
  p: { sectionX: number; sectionY: number | null; thickness?: number | null },
  unit: Unit
): string {
  const u = UNITS[unit].label;
  if (p.sectionY === null) return `Ø${formatLength(p.sectionX, unit)} ${u}${p.thickness != null ? ` × ${formatLength(p.thickness, unit)} ${u}` : ""}`;
  const parts = [p.sectionX, p.sectionY, ...(p.thickness != null ? [p.thickness] : [])];
  return parts.map((n) => `${formatLength(n, unit)} ${u}`).join(" × ");
}
