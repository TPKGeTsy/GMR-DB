// Turns the text pieces of one PDF page into table lines (left to right, top to bottom) for the BOM reader.

export interface PdfPiece {
  str: string;
  x: number;
  y: number;
}

const ROW_HEIGHT = 3;

/** The lines of a page. Pieces to the left of the ITEM NO. column are the drawing itself (balloon numbers of the 3D view
 *  sit at the same height as table rows and would be read as part of them), so they are left out. */
export function pieceLines(pieces: PdfPiece[]): string[] {
  const clean = pieces.filter((p) => p.str.trim() !== "");
  const headers = clean.filter((p) => /^ITEM\s*NO/i.test(p.str.trim()));
  const left = headers.length > 0 ? Math.min(...headers.map((p) => p.x)) - 10 : -Infinity;
  const rows = new Map<number, { x: number; text: string }[]>();
  for (const p of clean) {
    if (p.x < left) continue;
    const key = Math.round(p.y / ROW_HEIGHT);
    rows.set(key, [...(rows.get(key) ?? []), { x: p.x, text: p.str }]);
  }
  return [...rows.keys()]
    .sort((a, b) => b - a)
    .map((key) =>
      rows
        .get(key)!
        .sort((a, b) => a.x - b.x)
        .map((i) => i.text)
        .join(" ")
    );
}
