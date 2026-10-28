// Lays flat-pattern parts out on standard sheets of steel. Each part is treated as
// its bounding rectangle (it may be turned 90 degrees); MaxRects, best short side fit.

import type { Pt } from "./dxf";

export interface NestItem {
  id: string;
  name: string;
  width: number;
  height: number;
}

export interface Placed {
  id: string;
  name: string;
  /** Which copy of the part (1-based) when the quantity is more than 1. */
  copy: number;
  x: number;
  y: number;
  /** Size as laid on the sheet (already swapped when rotated). */
  w: number;
  h: number;
  rotated: boolean;
}

export interface Sheet {
  placed: Placed[];
}

export interface NestResult {
  sheets: Sheet[];
  /** Parts that do not fit on one sheet even when turned. */
  tooBig: string[];
}

export interface NestOptions {
  sheetWidth: number;
  sheetHeight: number;
  /** Space kept between parts (mm). */
  gap: number;
  allowRotate: boolean;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

class Bin {
  free: Rect[];
  placed: Placed[] = [];
  constructor(w: number, h: number) {
    this.free = [{ x: 0, y: 0, w, h }];
  }

  /** Best position for a w x h box (short-side-fit); null when nothing fits. */
  find(w: number, h: number, allowRotate: boolean): { rect: Rect; rotated: boolean; score: number; tie: number } | null {
    let best: { rect: Rect; rotated: boolean; score: number; tie: number } | null = null;
    const tryFit = (bw: number, bh: number, rotated: boolean) => {
      for (const f of this.free) {
        if (bw > f.w + 1e-9 || bh > f.h + 1e-9) continue;
        const score = Math.min(f.w - bw, f.h - bh);
        const tie = Math.max(f.w - bw, f.h - bh);
        if (!best || score < best.score || (score === best.score && tie < best.tie)) {
          best = { rect: { x: f.x, y: f.y, w: bw, h: bh }, rotated, score, tie };
        }
      }
    };
    tryFit(w, h, false);
    if (allowRotate && w !== h) tryFit(h, w, true);
    return best;
  }

  commit(r: Rect) {
    const next: Rect[] = [];
    for (const f of this.free) {
      if (r.x >= f.x + f.w || r.x + r.w <= f.x || r.y >= f.y + f.h || r.y + r.h <= f.y) {
        next.push(f);
        continue;
      }
      if (r.x > f.x) next.push({ x: f.x, y: f.y, w: r.x - f.x, h: f.h });
      if (r.x + r.w < f.x + f.w) next.push({ x: r.x + r.w, y: f.y, w: f.x + f.w - (r.x + r.w), h: f.h });
      if (r.y > f.y) next.push({ x: f.x, y: f.y, w: f.w, h: r.y - f.y });
      if (r.y + r.h < f.y + f.h) next.push({ x: f.x, y: r.y + r.h, w: f.w, h: f.y + f.h - (r.y + r.h) });
    }
    // Drop rectangles that sit completely inside another one.
    this.free = next.filter(
      (a, i) => !next.some((b, j) => i !== j && a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h && (i > j || a.w !== b.w || a.h !== b.h || a.x !== b.x || a.y !== b.y))
    );
  }
}

type Piece = NestItem & { copy: number };

function pack(pieces: Piece[], opts: NestOptions): Sheet[] {
  // The trick: grow the sheet by one gap, and every part by one gap, so parts
  // keep `gap` between them but may touch the sheet edge.
  const binW = opts.sheetWidth + opts.gap;
  const binH = opts.sheetHeight + opts.gap;
  const bins: Bin[] = [];
  for (const piece of pieces) {
    const w = piece.width + opts.gap;
    const h = piece.height + opts.gap;
    let chosen: { bin: Bin; fit: NonNullable<ReturnType<Bin["find"]>> } | null = null;
    for (const bin of bins) {
      const fit = bin.find(w, h, opts.allowRotate);
      if (fit) {
        chosen = { bin, fit };
        break; // first sheet that has room
      }
    }
    if (!chosen) {
      const bin = new Bin(binW, binH);
      const fit = bin.find(w, h, opts.allowRotate);
      if (!fit) continue; // checked by the caller
      bins.push(bin);
      chosen = { bin, fit };
    }
    const { bin, fit } = chosen;
    bin.commit(fit.rect);
    bin.placed.push({
      id: piece.id,
      name: piece.name,
      copy: piece.copy,
      x: fit.rect.x,
      y: fit.rect.y,
      w: fit.rect.w - opts.gap,
      h: fit.rect.h - opts.gap,
      rotated: fit.rotated,
    });
  }
  return bins.map((b) => ({ placed: b.placed }));
}

const usedArea = (s: Sheet) => s.placed.reduce((sum, p) => sum + p.w * p.h, 0);

/** Tries a few orders (largest first by area, by long side, by height) and keeps
 *  the layout with the fewest sheets, then the tightest. */
export function nest(items: { item: NestItem; quantity: number }[], opts: NestOptions): NestResult {
  const pieces: Piece[] = [];
  const tooBig: string[] = [];
  for (const { item, quantity } of items) {
    const fitsPlain = item.width <= opts.sheetWidth && item.height <= opts.sheetHeight;
    const fitsTurned = opts.allowRotate && item.height <= opts.sheetWidth && item.width <= opts.sheetHeight;
    if (!fitsPlain && !fitsTurned) {
      tooBig.push(item.name);
      continue;
    }
    for (let copy = 1; copy <= quantity; copy++) pieces.push({ ...item, copy });
  }
  if (pieces.length === 0) return { sheets: [], tooBig };

  const orders: ((a: Piece, b: Piece) => number)[] = [
    (a, b) => b.width * b.height - a.width * a.height,
    (a, b) => Math.max(b.width, b.height) - Math.max(a.width, a.height),
    (a, b) => b.height - a.height || b.width - a.width,
    (a, b) => b.width - a.width || b.height - a.height,
  ];
  let best: Sheet[] | null = null;
  for (const order of orders) {
    const sheets = pack([...pieces].sort(order), opts);
    if (
      !best ||
      sheets.length < best.length ||
      (sheets.length === best.length && sheets.reduce((s, x) => s + usedArea(x), 0) > best.reduce((s, x) => s + usedArea(x), 0))
    ) {
      best = sheets;
    }
  }
  return { sheets: best ?? [], tooBig };
}

/** Shoelace area of a closed polygon. */
export function loopArea(pts: Pt[]): number {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/** All loops of a part (outer first) turned 90 degrees when `rotated`, then moved so the
 *  OUTER loop's bounding box starts at (0, 0) - holes keep their place inside it. */
export function shapesOnSheet(loops: Pt[][], rotated: boolean): Pt[][] {
  const turned = loops.map((l) => (rotated ? l.map(([x, y]): Pt => [-y, x]) : l));
  const outer = turned[0] ?? [];
  const minX = Math.min(...outer.map((p) => p[0]));
  const minY = Math.min(...outer.map((p) => p[1]));
  return turned.map((l) => l.map(([x, y]): Pt => [x - minX, y - minY]));
}

/** Just the outline (first loop). */
export function shapeOnSheet(loop: Pt[], rotated: boolean): Pt[] {
  return shapesOnSheet([loop], rotated)[0];
}

export const SHEET_PRESETS = [
  { label: "1,219 × 2,438 (4×8 ฟุต)", width: 1219, height: 2438 },
  { label: "1,250 × 2,500", width: 1250, height: 2500 },
  { label: "1,500 × 3,000", width: 1500, height: 3000 },
  { label: "1,219 × 3,048 (4×10 ฟุต)", width: 1219, height: 3048 },
  { label: "1,500 × 6,000", width: 1500, height: 6000 },
] as const;

/** Identifies a layout: same parts at the same places on the same sheet size and
 *  thickness give the same text, so equal sheets can be counted together and a
 *  saved "done" count stays tied to that layout. */
export function layoutSignature(sheet: Sheet, opts: { sheetWidth: number; sheetHeight: number; thickness: number | null }): string {
  const parts = sheet.placed
    .map((p) => `${p.id}:${p.rotated ? "r" : "n"}@${Math.round(p.x)},${Math.round(p.y)}`)
    .sort()
    .join(";");
  const text = `${opts.sheetWidth}x${opts.sheetHeight}|${opts.thickness ?? ""}|${parts}`;
  // djb2 - short, stable, good enough to tell layouts apart.
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${opts.sheetWidth}x${opts.sheetHeight}-${(h >>> 0).toString(16)}-${sheet.placed.length}`;
}

export interface NestResultGroup {
  /** First sheet of this layout (the one drawn). */
  sheet: Sheet;
  /** How many identical sheets are needed. */
  count: number;
  signature: string;
}

/** Sheets with exactly the same layout become one "Result" needed `count` times. */
export function groupIdenticalSheets(
  sheets: Sheet[],
  opts: { sheetWidth: number; sheetHeight: number; thickness: number | null }
): NestResultGroup[] {
  const groups = new Map<string, NestResultGroup>();
  for (const sheet of sheets) {
    const signature = layoutSignature(sheet, opts);
    const existing = groups.get(signature);
    if (existing) existing.count += 1;
    else groups.set(signature, { sheet, count: 1, signature });
  }
  return [...groups.values()];
}
