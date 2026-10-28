// Steel cutting plan: which stock bars to cut for a list of required pieces.

export const STEEL_TYPES = {
  ST: { label: "ST เหล็กกล่องจัตุรัส", needsY: true },
  RT: { label: "RT เหล็กกล่องสี่เหลี่ยมผืนผ้า", needsY: true },
  FLAT: { label: "FB เหล็กแบน", needsY: true },
  ANGLE: { label: "L เหล็กฉาก", needsY: true },
  ROUND: { label: "เหล็กกลม (x = เส้นผ่านศูนย์กลาง)", needsY: false },
  PIPE: { label: "ท่อกลม (x = เส้นผ่านศูนย์กลาง)", needsY: false },
  // Older plans / CSV rows that only said "box" (square or rectangular not known).
  BOX: { label: "เหล็กกล่อง (ไม่ระบุ)", needsY: true },
} as const;

export type SteelType = keyof typeof STEEL_TYPES;
export const STEEL_TYPE_KEYS = Object.keys(STEEL_TYPES) as SteelType[];

export const DEFAULT_KERF_MM = 5;
export const DEFAULT_NEW_BAR_LENGTH_MM = 6000;
/** Bar lengths offered in the list: 1,000 - 20,000 mm in steps of 1,000. */
export const BAR_LENGTH_OPTIONS = Array.from({ length: 20 }, (_, i) => (i + 1) * 1000);

export interface SteelProfile {
  steelType: string;
  sectionX: number;
  sectionY: number | null;
  /** Wall thickness (mm); 50x50x2.3 and 50x50x3.0 tubes are different stock. */
  thickness?: number | null;
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
  return `${p.steelType}|${p.sectionX}|${p.sectionY ?? ""}|${p.thickness ?? ""}`;
}

export function profileLabel(p: SteelProfile): string {
  const size = p.sectionY != null ? `${p.sectionX} × ${p.sectionY}` : `Ø${p.sectionX}`;
  return `${steelTypeLabel(p.steelType)} ${size}${p.thickness != null ? ` หนา ${p.thickness}` : ""}`;
}

/** Same kind of steel together first (type, then x, y, thickness), and within
 *  one kind the longest cut first. */
export function comparePieces(a: SteelProfile & { cutLength: number }, b: SteelProfile & { cutLength: number }): number {
  const typeDiff = STEEL_TYPE_KEYS.indexOf(a.steelType as SteelType) - STEEL_TYPE_KEYS.indexOf(b.steelType as SteelType);
  if (typeDiff !== 0) return typeDiff;
  return (
    a.sectionX - b.sectionX ||
    (a.sectionY ?? 0) - (b.sectionY ?? 0) ||
    (a.thickness ?? 0) - (b.thickness ?? 0) ||
    b.cutLength - a.cutLength
  );
}

/** Adds up rows that are the same steel and the same length (quantity summed). */
export function mergeParts(parts: SteelPartInput[]): SteelPartInput[] {
  const merged = new Map<string, SteelPartInput>();
  for (const part of parts) {
    const key = `${profileKey(part)}|${part.cutLength}`;
    const existing = merged.get(key);
    if (existing) existing.quantity += part.quantity;
    else merged.set(key, { ...part });
  }
  return [...merged.values()].sort(comparePieces);
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
  /** Standard length of a bar bought new when the stock runs out (mm). */
  newBarLength: number;
  /** Own bar length for a kind of steel (key = profileKey) instead of the standard. */
  barLengths?: Record<string, number>;
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
    const buyLength = Math.max(0, options.barLengths?.[key] ?? newBarLength);
    const maxBar = Math.max(buyLength, longestStock);

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
      if (buyLength >= cut) {
        const bar: OpenBar = { source: "new", length: buyLength, remaining: buyLength, cuts: [] };
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
      newBarLength: buyLength,
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
    const [typeCell, xCell, yCell, zCell, qtyCell, tCell] = cells;
    // Accepts the key (ST), the code (FB, L) or the Thai name (เหล็กแบน).
    const upper = typeCell.toUpperCase();
    const type = STEEL_TYPE_KEYS.find((k) => {
      const code = STEEL_TYPES[k].label.match(/^([A-Z]{1,3})\s/)?.[1];
      const thai = STEEL_TYPES[k].label.replace(/^[A-Z]{1,3}\s+/, "");
      return k === upper || code === upper || (typeCell !== "" && thai.startsWith(typeCell));
    });
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
    const t = tCell === undefined || tCell === "" ? null : Number(tCell);
    if (t !== null && !(t > 0)) {
      errors.push(`แถว ${index + 1}: ความหนาไม่ถูกต้อง`);
      return;
    }
    parts.push({
      steelType: type,
      sectionX: x,
      sectionY: STEEL_TYPES[type].needsY ? y : null,
      thickness: t,
      cutLength: z,
      quantity: qty,
    });
  });
  return { parts: mergeParts(parts), errors };
}

export interface SkippedRow {
  line: string;
  reason: string;
}

const SIZE_RE = /(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)(?:\s*[xX×]\s*(\d+(?:\.\d+)?))?/;
const BOM_ROW_RE = /^(\d+)\s+(\d+)\s*(.*?)\s*(\d+(?:\.\d+)?)?$/;

function bomType(description: string, x: number, y: number): SteelType | null {
  if (/\b(ST|SHS)\b|SQUARE/i.test(description)) return "ST";
  if (/\b(RT|RHS)\b|RECT/i.test(description)) return "RT";
  // A plain "TUBE" / "BOX": square when both sides are equal, otherwise rectangular.
  if (/\bBOX\b|TUBE/i.test(description)) return x === y ? "ST" : "RT";
  if (/\bFB\b|FLAT/i.test(description)) return "FLAT";
  if (/ANGLE|^L\s/i.test(description)) return "ANGLE";
  return null;
}

/** Reads the bill-of-materials lines of a drawing (SolidWorks/SolidCAM style):
 *  `ITEM QTY DESCRIPTION LENGTH`, e.g. `1 16 ST 75 x 75 x 2.3 1742` or
 *  `1 2 TUBE, SQUARE 49.00 X 49.00 X 2.30 1710`. In the description the
 *  numbers are x, y and the wall thickness; the length is the last column.
 *  Rows without x, y and z (e.g. `4 1 Sheet`) are skipped and reported; lines
 *  that are not table rows at all (title block, frame letters) are ignored. */
export function parseBomLines(lines: string[]): { parts: SteelPartInput[]; skipped: SkippedRow[] } {
  const parts: SteelPartInput[] = [];
  const skipped: SkippedRow[] = [];
  for (const raw of lines) {
    // The drawing frame puts single row letters (A-F) at the line edges.
    const line = raw.trim().replace(/^[A-F]\s+(?=\d)/, "").replace(/\s+[A-F]$/, "").trim();
    const match = BOM_ROW_RE.exec(line);
    if (!match) continue;
    const [, , qtyText, description, lengthText] = match;
    const quantity = Number(qtyText);
    if (!(quantity >= 1)) continue;
    // The axis header ("8 7 6 5 4 3 2 1") has numbers only.
    if (description && !/[A-Za-z]/.test(description)) continue;
    // Frame/axis rows such as "8 8" or "7 7" carry no description and no length.
    if (!description && !lengthText) {
      if (Number(match[1]) > 8 || quantity !== Number(match[1])) skipped.push({ line, reason: "ไม่มีรายละเอียดและความยาว" });
      continue;
    }
    const size = SIZE_RE.exec(description);
    const length = lengthText === undefined ? NaN : Number(lengthText);
    const x = size ? Number(size[1]) : NaN;
    const y = size ? Number(size[2]) : NaN;
    const type = bomType(description, x, y);
    if (!type) {
      skipped.push({ line, reason: "ไม่ใช่เหล็กที่รู้จัก (ไม่มี x, y, z)" });
      continue;
    }
    if (!size || !(length > 0) || !(x > 0) || !(y > 0)) {
      skipped.push({ line, reason: "ข้อมูล x, y, z ไม่ครบ" });
      continue;
    }
    const t = size[3] === undefined ? null : Number(size[3]);
    parts.push({ steelType: type, sectionX: x, sectionY: y, thickness: t, cutLength: length, quantity });
  }
  return { parts: mergeParts(parts), skipped };
}
