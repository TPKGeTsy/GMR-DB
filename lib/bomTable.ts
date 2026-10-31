// Reads a drawing's parts list (ITEM NO. / PART NUMBER / DESCRIPTION / QTY.) from the text pieces of a PDF page,
// by column position. Rows may wrap over several lines (the item number and QTY sit in the middle of the row).

import type { BomRow } from "./bomImage";

export interface TextPiece {
  str: string;
  x: number;
  y: number;
  width: number;
}

const SAME_LINE = 3;

/** The table rows of one page; empty when the page has no ITEM / QTY header. */
export function parseBomTable(pieces: TextPiece[]): BomRow[] {
  const clean = pieces.filter((p) => p.str.trim() !== "");
  const itemHead = clean.find((p) => /^ITEM\b/i.test(p.str.trim()));
  const qtyHead = clean.find((p) => /^QTY\b/i.test(p.str.trim()));
  const partHead = clean.find((p) => /^(PART|DESCRIPTION)\b/i.test(p.str.trim()) && itemHead && Math.abs(p.y - itemHead.y) <= SAME_LINE);
  if (!itemHead || !qtyHead || !partHead || Math.abs(itemHead.y - qtyHead.y) > SAME_LINE) return [];

  const headY = itemHead.y;
  const itemLeft = itemHead.x;
  const partLeft = partHead.x;
  const headerRow = clean.filter((p) => Math.abs(p.y - headY) <= SAME_LINE);
  const itemRight = Math.max(...headerRow.filter((p) => p.x >= itemLeft && p.x < partLeft).map((p) => p.x + p.width));
  const qtyLeft = qtyHead.x - 30;
  const qtyRight = qtyHead.x + qtyHead.width + 30;
  const descHead = headerRow.find((p) => /^DESCRIPTION\b/i.test(p.str.trim()));

  const body = clean.filter((p) => p.y < headY - SAME_LINE);
  const candidates = body
    .filter((p) => /^\d{1,3}$/.test(p.str.trim()) && p.x + p.width / 2 >= itemLeft - 10 && p.x + p.width / 2 <= itemRight + 10)
    .sort((a, b) => b.y - a.y);
  if (candidates.length === 0) return [];

  // The table ends where the rows stop: a big jump down (to the title block's revision number, say) is not another row.
  const gaps = candidates.slice(1).map((it, i) => candidates[i].y - it.y);
  const typical = gaps.length > 0 ? [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : 40;
  let cut = candidates.findIndex((it, i) => i > 0 && candidates[i - 1].y - it.y > Math.max(typical * 3, 90));
  if (cut < 0) cut = candidates.length;
  const items = candidates.slice(0, cut);
  const bottom = items[items.length - 1].y - Math.max(typical, 30);

  const nearest = (y: number) => items.reduce((best, it) => (Math.abs(it.y - y) < Math.abs(best.y - y) ? it : best), items[0]);
  const rows = new Map<TextPiece, { qty: number | null; text: TextPiece[] }>(items.map((it) => [it, { qty: null, text: [] }]));

  for (const p of body) {
    if (items.includes(p) || p.y < bottom) continue;
    const s = p.str.trim();
    const cx = p.x + p.width / 2;
    if (/^\d+$/.test(s) && cx >= qtyLeft && cx <= qtyRight) {
      const row = rows.get(nearest(p.y))!;
      if (row.qty === null) row.qty = Number(s);
    } else if (p.x > itemRight && p.x < qtyLeft) {
      rows.get(nearest(p.y))!.text.push(p);
    }
  }

  const result: BomRow[] = [];
  for (const it of items) {
    const { qty, text } = rows.get(it)!;
    if (qty === null || text.length === 0) continue;
    const lines = [...text].sort((a, b) => b.y - a.y || a.x - b.x);
    const descFrom = descHead ? descHead.x - 10 : Infinity;
    const join = (list: TextPiece[]) => list.map((t) => t.str.trim()).join(" ").replace(/\s+/g, " ").trim();
    result.push({
      item: Number(it.str.trim()),
      partNumber: join(lines.filter((t) => t.x < descFrom)),
      description: join(lines.filter((t) => t.x >= descFrom)),
      qty,
    });
  }
  return result;
}
