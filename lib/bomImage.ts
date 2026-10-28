// A parts list that arrives as a picture (SolidWorks BOM: ITEM NO. / PART NUMBER /
// DESCRIPTION / QTY.). The picture is read by a vision model; this file turns its
// answer into rows, sorts them into kinds (screw / nut / washer / steel / ...) and
// totals the fasteners per size.

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

/** The text sent to the vision model with the picture. */
export const BOM_IMAGE_PROMPT =
  'Read this bill-of-materials table image. Reply with JSON only, no other text: ' +
  '{"rows":[{"item":number,"partNumber":string,"description":string,"qty":number}]}. ' +
  "One object per table row, in order. Copy the PART NUMBER and DESCRIPTION text exactly as printed " +
  "(keep sizes such as M16 x 2.0 x 60 and L 100x100x10 L = 200 mm). qty must be a whole number. " +
  "Use an empty string when a cell is empty. Include every row.";

/** Pulls the JSON out of a model reply (it may come wrapped in ``` fences). */
export function parseBomJson(reply: string): BomRow[] {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(reply);
  const body = (fenced ? fenced[1] : reply).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  let data: unknown;
  try {
    data = JSON.parse(body.slice(start, end + 1));
  } catch {
    return [];
  }
  const list = (data as { rows?: unknown }).rows;
  if (!Array.isArray(list)) return [];
  const rows: BomRow[] = [];
  for (const r of list) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const qty = Math.round(Number(o.qty));
    const partNumber = fixPartNumber(String(o.partNumber ?? "").trim());
    if (!partNumber || !(qty >= 1)) continue;
    const item = Number(o.item);
    rows.push({
      item: Number.isFinite(item) ? item : null,
      partNumber: partNumber.slice(0, 200),
      description: String(o.description ?? "").trim().slice(0, 200),
      qty,
    });
  }
  return rows;
}

/** Vision models read "B18.2.3.1M" as "818.2.3.1M" / "M18.22M"; put the B back. */
export function fixPartNumber(text: string): string {
  return text.replace(/(^|[\s(])(?:8|M|S)18\.(\d)/g, "$1B18.$2");
}

const SIZE = /\bM\s?(\d+(?:\.\d+)?)/i;

export function classifyBomRow(row: BomRow): BomCategory {
  const text = `${row.partNumber} ${row.description}`;
  if (/washer/i.test(text)) return "washer";
  if (/\bnut\b/i.test(text)) return "nut";
  if (/screw|\bbolt\b/i.test(text)) return "screw";
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

export function summarizeFasteners(rows: BomRow[]): FastenerTotal[] {
  const totals = new Map<string, FastenerTotal>();
  for (const row of rows) {
    const f = fastenerOf(row);
    if (!f) continue;
    const key = `${f.kind}|${f.size}|${f.length ?? ""}`;
    const cur = totals.get(key);
    if (cur) cur.quantity += row.qty;
    else totals.set(key, { ...f, quantity: row.qty });
  }
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
