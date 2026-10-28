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

/** Rows asked for per request: the model may only write ~1,000 tokens a minute. */
export const BOM_CHUNK_ROWS = 30;

/** The text sent with the picture: the next rows after ITEM NO. `after`, one per line. */
export function bomChunkPrompt(after: number): string {
  return (
    "Read the bill-of-materials table in this image. Output ONLY the rows whose ITEM NO. is greater than " +
    `${after} (every row when it is 0), in table order, at most ${BOM_CHUNK_ROWS} rows. ` +
    "One row per line in exactly this form: item|partNumber|description|qty " +
    "(copy the PART NUMBER and DESCRIPTION text exactly as printed, keeping sizes such as M16 x 2.0 x 60 and L 100x100x10 L = 200 mm; " +
    "leave description empty when the cell is empty; qty is a whole number). " +
    "When there are no more rows, print END as the last line. No other text, no table header."
  );
}

/** Reads the `item|partNumber|description|qty` lines. `ended` is true once END was printed. */
export function parseBomPipeLines(reply: string): { rows: BomRow[]; ended: boolean } {
  const rows: BomRow[] = [];
  let ended = false;
  for (const raw of reply.replace(/```[a-z]*/gi, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^END\b/i.test(line)) {
      ended = true;
      continue;
    }
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 4) continue; // a cut-off last line or chatter
    const qty = Math.round(Number(cells[cells.length - 1].replace(/,/g, "")));
    const item = Number(cells[0]);
    const partNumber = fixPartNumber(cells[1]);
    if (!partNumber || !(qty >= 1) || !Number.isFinite(item)) continue;
    rows.push({
      item,
      partNumber: partNumber.slice(0, 200),
      description: cells.slice(2, -1).join(" ").trim().slice(0, 200),
      qty,
    });
  }
  return { rows, ended };
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
