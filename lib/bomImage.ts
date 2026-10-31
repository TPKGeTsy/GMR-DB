// Rows of a screw / nut / washer parts list (saved by an older version that read pictures):
// sorts them into kinds (screw / nut / washer / steel / ...) and totals the fasteners per size.

import type { SteelPartInput } from "./steel";

export interface BomRow {
  item: number | null;
  partNumber: string;
  description: string;
  qty: number;
}

export type BomCategory = "screw" | "nut" | "washer" | "steel" | "plate" | "other";

export const CATEGORY_LABEL: Record<BomCategory, string> = {
  screw: "สกรู / น็อตหัวหกเหลี่ยม",
  nut: "น็อตตัวเมีย",
  washer: "แหวนรอง",
  steel: "เหล็กที่ตัด (ฉาก)",
  plate: "แผ่นเหล็ก / ชิ้นประกอบ",
  other: "อื่น ๆ",
};

const SIZE = /\bM\s?(\d+(?:\.\d+)?)/i;

export function classifyBomRow(row: BomRow): BomCategory {
  const text = `${row.partNumber} ${row.description}`;
  if (/washer/i.test(text)) return "washer";
  if (/\bnut\b/i.test(text)) return "nut";
  if (/screw|\bbolt\b|\bstud\b/i.test(text)) return "screw";
  if (angleFromRow(row)) return "steel";
  if (/plate|stiffener|\bTP\d|\bPL\b|support/i.test(text)) return "plate";
  return "other";
}

export interface Fastener {
  kind: "screw" | "nut" | "washer";
  /** e.g. "M16". */
  size: string;
  /** Screws only, mm. */
  length: number | null;
}

/** Size (and screw length) from e.g. "Hex cap screw, M16 x 2.0 x 60 -60N". */
export function fastenerOf(row: BomRow): Fastener | null {
  const cat = classifyBomRow(row);
  if (cat !== "screw" && cat !== "nut" && cat !== "washer") return null;
  const text = `${row.partNumber} ${row.description}`;
  if (cat === "washer") {
    const mm = /(\d+(?:\.\d+)?)\s*mm/i.exec(text);
    const m = SIZE.exec(text);
    const size = m ? `M${m[1]}` : mm ? `M${mm[1]}` : null;
    return size ? { kind: "washer", size, length: null } : null;
  }
  const m = SIZE.exec(text);
  if (!m) return null;
  let length: number | null = null;
  if (cat === "screw") {
    // M16 x 2.0 x 60: the number after the pitch is the length.
    const spec = /M\s?\d+(?:\.\d+)?\s*[xX×]\s*\d+(?:\.\d+)?\s*[xX×]\s*(\d+(?:\.\d+)?)/i.exec(text);
    length = spec ? Number(spec[1]) : null;
  }
  return { kind: cat, size: `M${m[1]}`, length };
}

export interface FastenerTotal extends Fastener {
  quantity: number;
}

/** Totals per exact kind/size/length. `sorted: false` keeps the order the items first appear in, so a new file never moves the lines above it. */
export function summarizeFasteners(rows: BomRow[], sorted = true): FastenerTotal[] {
  const totals = new Map<string, FastenerTotal>();
  for (const row of rows) {
    const f = fastenerOf(row);
    if (!f) continue;
    const key = `${f.kind}|${f.size}|${f.length ?? ""}`;
    const cur = totals.get(key);
    if (cur) cur.quantity += row.qty;
    else totals.set(key, { ...f, quantity: row.qty });
  }
  if (!sorted) return [...totals.values()];
  const order = { screw: 0, nut: 1, washer: 2 };
  return [...totals.values()].sort(
    (a, b) => Number(a.size.slice(1)) - Number(b.size.slice(1)) || order[a.kind] - order[b.kind] || (a.length ?? 0) - (b.length ?? 0)
  );
}

/** "L 100x100x10 L = 200 mm" -> an angle to cut: 100 x 100, 10 thick, 200 long. */
export function angleFromRow(row: BomRow): SteelPartInput | null {
  const text = `${row.description} ${row.partNumber}`;
  const m = /\bL\s*(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)\s*(?:mm)?[\s,;]*L\s*=\s*(\d+(?:\.\d+)?)/i.exec(text);
  if (!m) return null;
  return {
    steelType: "ANGLE",
    sectionX: Number(m[1]),
    sectionY: Number(m[2]),
    thickness: Number(m[3]),
    cutLength: Number(m[4]),
    quantity: row.qty,
  };
}
