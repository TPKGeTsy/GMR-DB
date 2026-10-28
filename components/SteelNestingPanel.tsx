"use client";

import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { SHEET_PRESETS, loopArea, nest, shapesOnSheet, type Placed } from "@/lib/nesting";
import type { SheetPartRow } from "./SteelSheetPanel";

const inputClass =
  "rounded border border-gray-300 px-2 py-1 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";
const fmt = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 1 });

// Same colours as the cut diagram: easy to tell apart, and numbered for a black-and-white print.
const COLORS = ["#fdba74", "#93c5fd", "#86efac", "#fde047", "#c4b5fd", "#f9a8d4", "#5eead4", "#fca5a5"];
const STEEL_KG_PER_MM3 = 7.85e-6;

function SheetDrawing({
  placed,
  width,
  height,
  parts,
  index,
}: {
  placed: Placed[];
  width: number;
  height: number;
  parts: SheetPartRow[];
  index: number;
}) {
  const toPath = (pts: [number, number][]) => pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]} ${p[1]}`).join(" ") + " Z";
  const fontSize = Math.max(width, height) * 0.022;
  return (
    <svg viewBox={`0 ${-height} ${width} ${height}`} className="h-auto max-h-[28rem] w-full border-2 border-black bg-white" role="img" aria-label={`แผ่นที่ ${index}`}>
      <g transform="scale(1,-1)">
        {placed.map((p, i) => {
          const part = parts.find((x) => x.id === p.id)!;
          const partIndex = parts.indexOf(part);
          const [shape, ...holePaths] = shapesOnSheet(part.geometry.loops, p.rotated);
          return (
            <g key={i} transform={`translate(${p.x} ${p.y})`}>
              <path d={toPath(shape)} fill={COLORS[partIndex % COLORS.length]} stroke="#111" strokeWidth={Math.max(width, height) * 0.0025} />
              {holePaths.map((h, k) => (
                <path key={k} d={toPath(h)} fill="#fff" stroke="#111" strokeWidth={Math.max(width, height) * 0.0015} />
              ))}
              <g transform={`translate(${p.w / 2} ${p.h / 2}) scale(1,-1)`}>
                <text textAnchor="middle" dominantBaseline="central" fontSize={fontSize} fontWeight="700" fill="#111" stroke="#fff" strokeWidth={fontSize * 0.12} paintOrder="stroke">
                  {partIndex + 1}
                </text>
              </g>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

/** Lays the DXF parts out on standard sheets, one group per thickness. */
export default function SteelNestingPanel({ parts, defaultGap }: { parts: SheetPartRow[]; defaultGap: number }) {
  const [presetIndex, setPresetIndex] = useState(0); // -1 = custom
  const [customW, setCustomW] = useState("1219");
  const [customH, setCustomH] = useState("2438");
  const [gap, setGap] = useState(String(defaultGap));
  const [allowRotate, setAllowRotate] = useState(true);

  const sheetWidth = presetIndex >= 0 ? SHEET_PRESETS[presetIndex].width : Number(customW);
  const sheetHeight = presetIndex >= 0 ? SHEET_PRESETS[presetIndex].height : Number(customH);
  const gapValue = Number.isFinite(Number(gap)) && gap.trim() !== "" ? Number(gap) : defaultGap;
  const valid = sheetWidth > 0 && sheetHeight > 0;

  const groups = useMemo(() => {
    if (!valid) return [];
    const byThickness = new Map<string, SheetPartRow[]>();
    for (const p of parts) {
      const key = p.thickness === null ? "" : String(p.thickness);
      byThickness.set(key, [...(byThickness.get(key) ?? []), p]);
    }
    return [...byThickness.entries()]
      .sort((a, b) => Number(a[0] || 0) - Number(b[0] || 0))
      .map(([key, list]) => {
        const result = nest(
          list.map((p) => ({ item: { id: p.id, name: p.name, width: p.width, height: p.height }, quantity: p.quantity })),
          { sheetWidth, sheetHeight, gap: gapValue, allowRotate }
        );
        const partArea = (id: string) => loopArea(list.find((p) => p.id === id)!.geometry.loops[0] ?? []);
        const used = result.sheets.reduce((sum, s) => sum + s.placed.reduce((n, p) => n + partArea(p.id), 0), 0);
        const total = result.sheets.length * sheetWidth * sheetHeight;
        return { thickness: key === "" ? null : Number(key), list, result, utilization: total > 0 ? used / total : 0 };
      });
  }, [parts, sheetWidth, sheetHeight, gapValue, allowRotate, valid]);

  if (parts.length === 0) return null;
  const totalSheets = groups.reduce((n, g) => n + g.result.sheets.length, 0);

  return (
    <section className="rounded-lg border border-gray-100 bg-white p-4 shadow print:border-0 print:p-0 print:shadow-none">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">วางชิ้นแผ่นลงแผ่นเหล็ก</h2>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1 rounded bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-700 print:hidden"
        >
          <Printer className="h-4 w-4" />
          พิมพ์ / PDF
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-4 rounded border border-orange-200 bg-orange-50 p-3 print:hidden">
        <label className="block text-xs text-gray-600">
          ขนาดแผ่นเหล็ก (มม.)
          <select value={presetIndex} onChange={(e) => setPresetIndex(Number(e.target.value))} className={`${inputClass} block`}>
            {SHEET_PRESETS.map((p, i) => (
              <option key={p.label} value={i}>
                {p.label}
              </option>
            ))}
            <option value={-1}>กำหนดเอง…</option>
          </select>
        </label>
        {presetIndex < 0 && (
          <span className="flex items-end gap-1 text-xs text-gray-600">
            <input type="number" min={1} value={customW} onChange={(e) => setCustomW(e.target.value)} className={`${inputClass} w-24`} />×
            <input type="number" min={1} value={customH} onChange={(e) => setCustomH(e.target.value)} className={`${inputClass} w-24`} />
          </span>
        )}
        <label className="block text-xs text-gray-600">
          ระยะห่างระหว่างชิ้น (มม.)
          <input type="number" min={0} step="any" value={gap} onChange={(e) => setGap(e.target.value)} className={`${inputClass} block w-24`} />
        </label>
        <label className="inline-flex items-center gap-1 text-xs text-gray-700">
          <input type="checkbox" checked={allowRotate} onChange={(e) => setAllowRotate(e.target.checked)} />
          หมุนชิ้นงาน 90° ได้
        </label>
        <p className="text-xs text-gray-500">วางตามกรอบสี่เหลี่ยมของแต่ละชิ้น (ไม่สอดชิ้นเข้าในช่องว่างของกันและกัน) ความหนาต่างกันแยกแผ่น</p>
      </div>

      {!valid && <p className="text-sm text-red-600">ขนาดแผ่นไม่ถูกต้อง</p>}

      {valid && (
        <p className="mb-3 text-base font-semibold text-gray-900">
          ต้องใช้แผ่นเหล็กรวม {totalSheets} แผ่น (แผ่นละ {fmt(sheetWidth)} × {fmt(sheetHeight)} มม.)
        </p>
      )}

      <div className="space-y-6">
        {groups.map((g) => {
          const kgEach = g.thickness !== null ? sheetWidth * sheetHeight * g.thickness * STEEL_KG_PER_MM3 : null;
          return (
            <div key={g.thickness ?? "none"}>
              <h3 className="mb-1 font-bold text-gray-900">
                {g.thickness !== null ? `หนา ${fmt(g.thickness)} มม.` : "ยังไม่ระบุความหนา (กรอกที่การ์ดชิ้นงานด้านบน)"} — {g.result.sheets.length} แผ่น
                <span className="ml-2 text-sm font-normal text-gray-600">
                  ใช้เนื้อเหล็ก {(g.utilization * 100).toFixed(0)}%
                  {kgEach !== null && ` · แผ่นละ ~${fmt(kgEach)} กก. รวม ~${fmt(kgEach * g.result.sheets.length)} กก.`}
                </span>
              </h3>
              {g.result.tooBig.length > 0 && <p className="mb-2 text-sm text-red-600">ใหญ่เกินแผ่น: {g.result.tooBig.join(", ")}</p>}
              <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-700">
                {g.list.map((p) => (
                  <li key={p.id} className="inline-flex items-center gap-1.5">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-black text-xs font-bold" style={{ background: COLORS[parts.indexOf(p) % COLORS.length] }}>
                      {parts.indexOf(p) + 1}
                    </span>
                    {p.name} × {p.quantity}
                  </li>
                ))}
              </ul>
              <div className="grid gap-4 md:grid-cols-2">
                {g.result.sheets.map((s, i) => (
                  <figure key={i} className="break-inside-avoid">
                    <figcaption className="mb-1 text-sm font-semibold text-gray-800">
                      แผ่นที่ {i + 1} · {s.placed.length} ชิ้น
                    </figcaption>
                    <SheetDrawing placed={s.placed} width={sheetWidth} height={sheetHeight} parts={parts} index={i + 1} />
                  </figure>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
