import { groupIdenticalSheets, nest, type NestOptions, type NestResultGroup, type Placed } from "./nesting";

export interface HoleSummary {
  /** e.g. "Ø22" */
  size: string;
  count: number;
}

export interface CutStep {
  /** 1, 2, 3 ... the order the parts are cut on the sheet. */
  step: number;
  partId: string;
  name: string;
  /** Which copy of the part (1-based). */
  copy: number;
  /** Centre of the part on the sheet (mm, y up). */
  center: [number, number];
  width: number;
  height: number;
  holes: HoleSummary[];
  holeTotal: number;
}

/** The order to cut the parts on one sheet: start at the corner where the head begins (0, 0) and always go to the
 *  nearest part not cut yet. Each part is cut inside-out: its holes first (so the part is still held by the
 *  sheet), then its outline. */
export function cutSequence(placed: Placed[], holesOf: (partId: string) => { size: string }[]): CutStep[] {
  const left = placed.map((p) => ({ p, c: [p.x + p.w / 2, p.y + p.h / 2] as [number, number] }));
  const steps: CutStep[] = [];
  let at: [number, number] = [0, 0];
  while (left.length > 0) {
    let best = 0;
    for (let i = 1; i < left.length; i++) {
      if (Math.hypot(left[i].c[0] - at[0], left[i].c[1] - at[1]) < Math.hypot(left[best].c[0] - at[0], left[best].c[1] - at[1])) best = i;
    }
    const { p, c } = left.splice(best, 1)[0];
    at = c;
    const counts = new Map<string, number>();
    for (const h of holesOf(p.id)) counts.set(h.size, (counts.get(h.size) ?? 0) + 1);
    const holes = [...counts.entries()].map(([size, count]) => ({ size, count })).sort((a, b) => b.count - a.count);
    steps.push({
      step: steps.length + 1,
      partId: p.id,
      name: p.name,
      copy: p.copy,
      center: c,
      width: p.w,
      height: p.h,
      holes,
      holeTotal: holes.reduce((n, h) => n + h.count, 0),
    });
  }
  return steps;
}

export interface SheetJobPart {
  id: string;
  name: string;
  width: number;
  height: number;
  thickness: number | null;
  quantity: number;
}

export interface SheetJobGroup {
  thickness: number | null;
  results: NestResultGroup[];
  tooBig: string[];
}

/** Lays the parts out on sheets, one group per thickness, equal sheets counted together. */
export function planSheetJob(parts: SheetJobPart[], opts: NestOptions): SheetJobGroup[] {
  const byThickness = new Map<string, SheetJobPart[]>();
  for (const p of parts) {
    const key = p.thickness === null ? "" : String(p.thickness);
    byThickness.set(key, [...(byThickness.get(key) ?? []), p]);
  }
  return [...byThickness.entries()]
    .sort((a, b) => Number(a[0] || 0) - Number(b[0] || 0))
    .map(([key, list]) => {
      const thickness = key === "" ? null : Number(key);
      const result = nest(
        list.map((p) => ({ item: { id: p.id, name: p.name, width: p.width, height: p.height }, quantity: p.quantity })),
        opts
      );
      return {
        thickness,
        results: groupIdenticalSheets(result.sheets, { sheetWidth: opts.sheetWidth, sheetHeight: opts.sheetHeight, thickness }),
        tooBig: result.tooBig,
      };
    });
}
