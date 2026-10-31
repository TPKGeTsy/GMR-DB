"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ListOrdered, Minus, Plus, Printer } from "lucide-react";
import { bulkUpdateSheetParts, setNestDone } from "@/app/actions/steelSources";
import { SHEET_PRESETS, groupIdenticalSheets, loopArea, nest, shapesOnSheet, type NestResultGroup, type Placed } from "@/lib/nesting";
import type { SheetPartRow } from "./SteelSheetPanel";
import { usePrintSection } from "./PrintLayout";

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
  compact = false,
  className = "h-auto max-h-[34rem] w-full",
}: {
  placed: Placed[];
  width: number;
  height: number;
  parts: SheetPartRow[];
  /** Thumbnail: no numbers, thin lines. */
  compact?: boolean;
  className?: string;
}) {
  const toPath = (pts: [number, number][]) => pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]} ${p[1]}`).join(" ") + " Z";
  const longest = Math.max(width, height);
  const fontSize = longest * 0.022;
  return (
    <svg viewBox={`0 ${-height} ${width} ${height}`} className={`border border-black bg-white ${className}`} role="img" aria-label="ผังวางชิ้นงานบนแผ่นเหล็ก">
      <g transform="scale(1,-1)">
        {placed.map((p, i) => {
          const part = parts.find((x) => x.id === p.id)!;
          const partIndex = parts.indexOf(part);
          const [shape, ...holePaths] = shapesOnSheet(part.geometry.loops, p.rotated);
          return (
            <g key={i} transform={`translate(${p.x} ${p.y})`}>
              <path d={toPath(shape)} fill={COLORS[partIndex % COLORS.length]} stroke="#111" strokeWidth={longest * (compact ? 0.004 : 0.0025)} />
              {!compact &&
                holePaths.map((h, k) => <path key={k} d={toPath(h)} fill="#fff" stroke="#111" strokeWidth={longest * 0.0015} />)}
              {!compact && (
                <g transform={`translate(${p.w / 2} ${p.h / 2}) scale(1,-1)`}>
                  <text textAnchor="middle" dominantBaseline="central" fontSize={fontSize} fontWeight="700" fill="#111" stroke="#fff" strokeWidth={fontSize * 0.12} paintOrder="stroke">
                    {partIndex + 1}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

interface ThicknessGroup {
  thickness: number | null;
  list: SheetPartRow[];
  results: NestResultGroup[];
  sheetCount: number;
  tooBig: string[];
  utilization: number;
}

/** Lays the DXF parts out on standard sheets (one list of "Results" per thickness),
 *  with a Done x/y counter for how many of each layout have been cut. */
export default function SteelNestingPanel({
  planId,
  parts,
  defaultGap,
  canEdit,
  doneBySignature,
}: {
  planId: string;
  parts: SheetPartRow[];
  defaultGap: number;
  canEdit: boolean;
  doneBySignature: Record<string, number>;
}) {
  const [presetIndex, setPresetIndex] = useState(0); // -1 = custom
  const [customW, setCustomW] = useState("1219");
  const [customH, setCustomH] = useState("2438");
  const [gap, setGap] = useState(String(defaultGap));
  const [allowRotate, setAllowRotate] = useState(true);
  const [selected, setSelected] = useState<Record<string, string>>({}); // thickness key -> signature
  const [done, setDone] = useState<Record<string, number>>(doneBySignature);
  const print = usePrintSection("nesting");
  const router = useRouter();
  const [times, setTimes] = useState("");
  const [timesMessage, setTimesMessage] = useState<string | null>(null);

  const multiplyAll = async () => {
    setTimesMessage(null);
    const res = await bulkUpdateSheetParts(planId, { multiplyBy: Math.floor(Number(times)) });
    if (!res.success) {
      setTimesMessage(res.error ?? "บันทึกไม่สำเร็จ");
      return;
    }
    setTimesMessage(`คูณ ${res.count} ชิ้นแล้ว`);
    setTimes("");
    router.refresh();
  };

  const sheetWidth = presetIndex >= 0 ? SHEET_PRESETS[presetIndex].width : Number(customW);
  const sheetHeight = presetIndex >= 0 ? SHEET_PRESETS[presetIndex].height : Number(customH);
  const gapValue = Number.isFinite(Number(gap)) && gap.trim() !== "" ? Number(gap) : defaultGap;
  const valid = sheetWidth > 0 && sheetHeight > 0;

  const groups = useMemo<ThicknessGroup[]>(() => {
    if (!valid) return [];
    const byThickness = new Map<string, SheetPartRow[]>();
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
          { sheetWidth, sheetHeight, gap: gapValue, allowRotate }
        );
        const partArea = (id: string) => loopArea(list.find((p) => p.id === id)!.geometry.loops[0] ?? []);
        const used = result.sheets.reduce((sum, s) => sum + s.placed.reduce((n, p) => n + partArea(p.id), 0), 0);
        const total = result.sheets.length * sheetWidth * sheetHeight;
        return {
          thickness,
          list,
          results: groupIdenticalSheets(result.sheets, { sheetWidth, sheetHeight, thickness }),
          sheetCount: result.sheets.length,
          tooBig: result.tooBig,
          utilization: total > 0 ? used / total : 0,
        };
      });
  }, [parts, sheetWidth, sheetHeight, gapValue, allowRotate, valid]);

  if (parts.length === 0) return null;
  const totalSheets = groups.reduce((n, g) => n + g.sheetCount, 0);

  const sheetUtilization = (g: ThicknessGroup, r: NestResultGroup) => {
    const used = r.sheet.placed.reduce((n, p) => n + loopArea(g.list.find((x) => x.id === p.id)!.geometry.loops[0] ?? []), 0);
    return (used / (sheetWidth * sheetHeight)) * 100;
  };

  const changeDone = async (signature: string, count: number, delta: number) => {
    const next = Math.min(count, Math.max(0, (done[signature] ?? 0) + delta));
    setDone((prev) => ({ ...prev, [signature]: next }));
    const res = await setNestDone(planId, signature, next);
    if (!res.success) setDone((prev) => ({ ...prev, [signature]: done[signature] ?? 0 }));
  };

  return (
    <section id="sec-nesting" style={print.style} className={`scroll-mt-36 rounded-lg border border-gray-100 bg-white p-4 shadow print:border-0 print:p-0 print:shadow-none ${print.className}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">วางชิ้นแผ่นลงแผ่นเหล็ก</h2>
        <Link
          href={`/steel-cutting/${planId}/cut?w=${sheetWidth}&h=${sheetHeight}&gap=${gapValue}&rot=${allowRotate ? 1 : 0}`}
          className="inline-flex items-center gap-1 rounded border border-orange-600 px-3 py-1.5 text-sm font-semibold text-orange-700 hover:bg-orange-50 print:hidden"
        >
          <ListOrdered className="h-4 w-4" />
          เปิดใบสั่งตัด (ขั้นตอน 1, 2, 3 …)
        </Link>
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
        <label className="inline-flex cursor-pointer select-none items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:border-orange-400 has-[:checked]:border-orange-500 has-[:checked]:bg-orange-50">
          <input type="checkbox" className="h-5 w-5 cursor-pointer accent-orange-600" checked={allowRotate} onChange={(e) => setAllowRotate(e.target.checked)} />
          หมุนชิ้นงาน 90° ได้
        </label>
        {canEdit && (
          <label className="block text-xs text-gray-600">
            คูณจำนวนทุกชิ้น ×
            <span className="mt-0.5 flex gap-1">
              <input type="number" min={1} step={1} value={times} onChange={(e) => setTimes(e.target.value)} placeholder="เช่น 2" className={`${inputClass} w-20`} />
              <button type="button" disabled={!(Number(times) >= 1)} onClick={multiplyAll} className="rounded bg-orange-600 px-2 py-1 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-50">
                คูณทุกชิ้น
              </button>
            </span>
            {timesMessage && <span className="text-gray-700">{timesMessage}</span>}
          </label>
        )}
        <p className="text-xs text-gray-500">วางตามกรอบสี่เหลี่ยมของแต่ละชิ้น ความหนาต่างกันแยกแผ่น แผ่นที่วางเหมือนกันรวมเป็นแบบเดียว (ตัดแล้ว = ตัดไปแล้วกี่แผ่น)</p>
      </div>

      {!valid && <p className="text-sm text-red-600">ขนาดแผ่นไม่ถูกต้อง</p>}
      {valid && (
        <p className="mb-3 text-base font-semibold text-gray-900">
          ต้องใช้แผ่นเหล็กรวม {totalSheets} แผ่น (แผ่นละ {fmt(sheetWidth)} × {fmt(sheetHeight)} มม.)
        </p>
      )}

      <div className="space-y-8">
        {groups.map((g) => {
          const groupKey = g.thickness === null ? "none" : String(g.thickness);
          const kgEach = g.thickness !== null ? sheetWidth * sheetHeight * g.thickness * STEEL_KG_PER_MM3 : null;
          const chosen = g.results.find((r) => r.signature === selected[groupKey]) ?? g.results[0];
          return (
            <div key={groupKey}>
              <h3 className="mb-1 flex flex-wrap items-baseline gap-x-3 font-bold text-gray-900">
                <span className="text-xl">{g.thickness !== null ? `${fmt(g.thickness)} mm` : "ยังไม่ระบุความหนา"}</span>
                <span>{g.sheetCount} แผ่น</span>
                <span className="text-sm font-normal text-gray-600">
                  ใช้เนื้อเหล็ก {(g.utilization * 100).toFixed(1)}%
                  {kgEach !== null && ` · แผ่นละ ~${fmt(kgEach)} กก. รวม ~${fmt(kgEach * g.sheetCount)} กก.`}
                </span>
              </h3>
              {g.thickness === null && <p className="mb-1 text-xs text-gray-500 print:hidden">กรอกความหนาที่การ์ดชิ้นงานด้านบน</p>}
              {g.tooBig.length > 0 && <p className="mb-2 text-sm text-red-600">ใหญ่เกินแผ่น: {g.tooBig.join(", ")}</p>}
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

              {/* On screen: list of Results on the left, the chosen one big on the right. */}
              <div className="grid gap-4 md:grid-cols-[17rem_1fr] print:hidden">
                <ul className="max-h-[34rem] space-y-2 overflow-y-auto rounded border border-gray-200 bg-gray-50 p-2">
                  {g.results.map((r, i) => {
                    const d = Math.min(done[r.signature] ?? 0, r.count);
                    const isChosen = r.signature === chosen?.signature;
                    return (
                      <li key={r.signature}>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelected((prev) => ({ ...prev, [groupKey]: r.signature }))}
                          onKeyDown={(e) => e.key === "Enter" && setSelected((prev) => ({ ...prev, [groupKey]: r.signature }))}
                          className={`flex cursor-pointer gap-2 rounded border p-2 text-xs ${isChosen ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:border-orange-400"}`}
                        >
                          <SheetDrawing placed={r.sheet.placed} width={sheetWidth} height={sheetHeight} parts={parts} compact className="h-24 w-auto shrink-0" />
                          <div className="min-w-0 space-y-0.5">
                            <p className="text-sm font-bold text-gray-900">แบบที่ {i + 1}</p>
                            <p className="text-gray-600">
                              {sheetWidth}*{sheetHeight}
                            </p>
                            <p className="text-gray-600">Parts Count: {r.sheet.placed.length}</p>
                            <p className="text-gray-600">Utilization: {sheetUtilization(g, r).toFixed(1)}%</p>
                            <p className="flex items-center gap-1 font-semibold">
                              <span className={d >= r.count ? "text-green-700" : "text-amber-600"}>
                                Done: {d}/{r.count}
                              </span>
                              {canEdit && (
                                <>
                                  <button
                                    type="button"
                                    title="ตัดไปแล้วน้อยลง 1"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      changeDone(r.signature, r.count, -1);
                                    }}
                                    className="rounded border border-gray-300 p-0.5 text-gray-500 hover:bg-gray-100"
                                  >
                                    <Minus className="h-3 w-3" />
                                  </button>
                                  <button
                                    type="button"
                                    title="ตัดเสร็จเพิ่ม 1 แผ่น"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      changeDone(r.signature, r.count, 1);
                                    }}
                                    className="rounded border border-gray-300 p-0.5 text-gray-500 hover:bg-gray-100"
                                  >
                                    <Plus className="h-3 w-3" />
                                  </button>
                                </>
                              )}
                            </p>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {chosen && (
                  <figure>
                    <figcaption className="mb-1 text-sm font-semibold text-gray-800">
                      แบบที่ {g.results.indexOf(chosen) + 1} · {chosen.sheet.placed.length} ชิ้น · ต้องตัด {chosen.count} แผ่น
                    </figcaption>
                    <SheetDrawing placed={chosen.sheet.placed} width={sheetWidth} height={sheetHeight} parts={parts} />
                  </figure>
                )}
              </div>

              {/* In a print: every Result, big. */}
              <div className="hidden gap-4 print:grid print:grid-cols-2">
                {g.results.map((r, i) => (
                  <figure key={r.signature} className="break-inside-avoid">
                    <figcaption className="mb-1 text-sm font-semibold text-gray-800">
                      แบบที่ {i + 1} · {fmt(sheetWidth)}×{fmt(sheetHeight)} · {r.sheet.placed.length} ชิ้น · {sheetUtilization(g, r).toFixed(1)}% · ตัด {r.count} แผ่น (ตัดแล้ว {Math.min(done[r.signature] ?? 0, r.count)}/{r.count})
                    </figcaption>
                    <SheetDrawing placed={r.sheet.placed} width={sheetWidth} height={sheetHeight} parts={parts} />
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
