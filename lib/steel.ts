// Steel cutting plan: which stock bars to cut for a list of required pieces.

export const STEEL_TYPES = {
  BOX: { label: "เหล็กกล่อง", needsY: true },
  FLAT: { label: "เหล็กแบน", needsY: true },
  ANGLE: { label: "เหล็กฉาก", needsY: true },
  ROUND: { label: "เหล็กกลม (x = เส้นผ่านศูนย์กลาง)", needsY: false },
  PIPE: { label: "ท่อกลม (x = เส้นผ่านศูนย์กลาง)", needsY: false },
} as const;

export type SteelType = keyof typeof STEEL_TYPES;
export const STEEL_TYPE_KEYS = Object.keys(STEEL_TYPES) as SteelType[];

export const DEFAULT_KERF_MM = 3;
export const DEFAULT_NEW_BAR_LENGTH_MM = 6000;

export interface SteelProfile {
  steelType: string;
  sectionX: number;
  sectionY: number | null;
}

export interface SteelPartInput extends SteelProfile {
  id?: string;
  cutLength: number;
  quantity: number;
}

export interface SteelStockInput extends SteelProfile {
  id?: string;
  length: number;
  quantity: number;
}

export function isSteelType(value: string): value is SteelType {
  return value in STEEL_TYPES;
}

export function steelTypeLabel(type: string): string {
  return isSteelType(type) ? STEEL_TYPES[type].label.replace(/ \(.*\)$/, "") : type;
}

/** "เหล็กกล่อง 50 × 25" - the same profile always gets the same key/label. */
export function profileKey(p: SteelProfile): string {
  return `${p.steelType}|${p.sectionX}|${p.sectionY ?? ""}`;
}

export function profileLabel(p: SteelProfile): string {
  const size = p.sectionY != null ? `${p.sectionX} × ${p.sectionY}` : `Ø${p.sectionX}`;
  return `${steelTypeLabel(p.steelType)} ${size}`;
}

export interface PlannedBar {
  source: "stock" | "new";
  length: number;
  cuts: number[];
  leftover: number;
}

export interface ProfilePlan {
  key: string;
  label: string;
  bars: PlannedBar[];
  stockUsed: number;
  stockUnused: number;
  /** Bars that must be bought, because the stock on hand is not enough. */
  toBuy: number;
  newBarLength: number;
  piecesTotal: number;
  /** Cut lengths that do not fit in any bar (longer than the longest one). */
  tooLong: number[];
  usedLength: number;
  wasteLength: number;
}

export interface CuttingPlan {
  profiles: ProfilePlan[];
  totalToBuy: number;
  hasProblem: boolean;
}

export interface PlanOptions {
  /** Material lost to the saw blade at each cut (mm). */
  kerf: number;
  /** Length of a bar bought new when the stock runs out (mm). */
  newBarLength: number;
}

/** Best-fit decreasing, per profile. Stock bars on hand are used first (the
 *  shortest one that still fits the piece, to keep long bars for long cuts);
 *  new bars of `newBarLength` are only opened when nothing on hand fits.
 *  A cut costs `kerf` of material, except that a piece needs no kerf when it
 *  takes the rest of the bar exactly. */
export function planCuts(parts: SteelPartInput[], stock: SteelStockInput[], options: PlanOptions): CuttingPlan {
  const kerf = Math.max(0, options.kerf);
  const newBarLength = Math.max(0, options.newBarLength);

  const profiles = new Map<string, SteelProfile>();
  const pieces = new Map<string, number[]>();
  const stockBars = new Map<string, number[]>();

  for (const part of parts) {
    if (!(part.cutLength > 0) || !(part.quantity > 0)) continue;
    const key = profileKey(part);
    profiles.set(key, part);
    const list = pieces.get(key) ?? [];
    for (let i = 0; i < part.quantity; i++) list.push(part.cutLength);
    pieces.set(key, list);
  }
  for (const s of stock) {
    if (!(s.length > 0) || !(s.quantity > 0)) continue;
    const key = profileKey(s);
    const list = stockBars.get(key) ?? [];
    for (let i = 0; i < s.quantity; i++) list.push(s.length);
    stockBars.set(key, list);
  }

  const result: ProfilePlan[] = [];
  for (const [key, profile] of profiles) {
    const wanted = [...(pieces.get(key) ?? [])].sort((a, b) => b - a);
    const available = [...(stockBars.get(key) ?? [])].sort((a, b) => a - b);
    const longestStock = available.length > 0 ? available[available.length - 1] : 0;
    const maxBar = Math.max(newBarLength, longestStock);

    interface OpenBar {
      source: "stock" | "new";
      length: number;
      remaining: number;
      cuts: number[];
    }
    const open: OpenBar[] = [];
    const tooLong: number[] = [];

    const place = (bar: OpenBar, cut: number) => {
      bar.cuts.push(cut);
      bar.remaining = Math.max(0, bar.remaining - cut - kerf);
    };

    for (const cut of wanted) {
      if (cut > maxBar) {
        tooLong.push(cut);
        continue;
      }
      let best: OpenBar | null = null;
      for (const bar of open) {
        if (bar.remaining >= cut && (!best || bar.remaining < best.remaining)) best = bar;
      }
      if (best) {
        place(best, cut);
        continue;
      }
      const stockIndex = available.findIndex((len) => len >= cut);
      if (stockIndex >= 0) {
        const [length] = available.splice(stockIndex, 1);
        const bar: OpenBar = { source: "stock", length, remaining: length, cuts: [] };
        open.push(bar);
        place(bar, cut);
        continue;
      }
      if (newBarLength >= cut) {
        const bar: OpenBar = { source: "new", length: newBarLength, remaining: newBarLength, cuts: [] };
        open.push(bar);
        place(bar, cut);
      } else {
        tooLong.push(cut);
      }
    }

    const bars: PlannedBar[] = open.map((b) => {
      const used = b.cuts.reduce((sum, c) => sum + c, 0);
      const kerfLost = kerf * Math.max(0, b.cuts.length - 1);
      return {
        source: b.source,
        length: b.length,
        cuts: b.cuts,
        leftover: Math.max(0, b.length - used - kerfLost),
      };
    });
    const usedLength = bars.reduce((sum, b) => sum + b.cuts.reduce((s, c) => s + c, 0), 0);
    const totalLength = bars.reduce((sum, b) => sum + b.length, 0);

    result.push({
      key,
      label: profileLabel(profile),
      bars,
      stockUsed: bars.filter((b) => b.source === "stock").length,
      stockUnused: available.length,
      toBuy: bars.filter((b) => b.source === "new").length,
      newBarLength,
      piecesTotal: wanted.length,
      tooLong,
      usedLength,
      wasteLength: Math.max(0, totalLength - usedLength),
    });
  }

  result.sort((a, b) => a.label.localeCompare(b.label, "th"));
  return {
    profiles: result,
    totalToBuy: result.reduce((sum, p) => sum + p.toBuy, 0),
    hasProblem: result.some((p) => p.tooLong.length > 0),
  };
}

/** Parses pasted/exported rows: `type, x, y, length, quantity` (comma, tab or
 *  semicolon separated; a header row and blank lines are skipped). `type` may be
 *  the key (BOX) or the Thai label (เหล็กกล่อง). Returns the rows it could read
 *  and a message for each row it could not. */
export function parsePartsCsv(text: string): { parts: SteelPartInput[]; errors: string[] } {
  const parts: SteelPartInput[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    const cells = line.split(/[,\t;]/).map((c) => c.trim());
    const [typeCell, xCell, yCell, zCell, qtyCell] = cells;
    const type = STEEL_TYPE_KEYS.find(
      (k) => k === typeCell.toUpperCase() || STEEL_TYPES[k].label.startsWith(typeCell) || typeCell.startsWith(steelTypeLabel(k))
    );
    const x = Number(xCell);
    const z = Number(zCell);
    const qty = qtyCell === undefined || qtyCell === "" ? 1 : Number(qtyCell);
    if (!type) {
      // The first line is usually a header ("type,x,y,z,qty") - skip it quietly.
      if (index > 0 || Number.isFinite(x)) errors.push(`แถว ${index + 1}: ไม่รู้จักประเภท "${typeCell}"`);
      return;
    }
    const y = yCell === undefined || yCell === "" ? null : Number(yCell);
    if (!(x > 0) || !(z > 0) || !Number.isInteger(qty) || qty < 1 || (y !== null && !(y > 0))) {
      errors.push(`แถว ${index + 1}: ตัวเลขไม่ถูกต้อง`);
      return;
    }
    if (STEEL_TYPES[type].needsY && y === null) {
      errors.push(`แถว ${index + 1}: ${STEEL_TYPES[type].label} ต้องมีค่า y`);
      return;
    }
    parts.push({ steelType: type, sectionX: x, sectionY: STEEL_TYPES[type].needsY ? y : null, cutLength: z, quantity: qty });
  });
  return { parts, errors };
}
