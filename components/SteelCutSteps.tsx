"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Minus, Plus, Printer } from "lucide-react";
import { setNestDone } from "@/app/actions/steelSources";
import { cutSequence, planSheetJob, type CutStep } from "@/lib/cutSequence";
import { SHEET_PRESETS, shapesOnSheet, type NestResultGroup } from "@/lib/nesting";
import type { SheetPartRow } from "./SteelSheetPanel";

const COLORS = ["#fdba74", "#93c5fd", "#86efac", "#fde047", "#c4b5fd", "#f9a8d4", "#5eead4", "#fca5a5"];
const inputClass = "rounded border border-gray-300 px-2 py-1 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";
const fmt = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 1 });

/** One sheet with every part numbered in the order it is cut. */
function SheetDrawing({ result, steps, width, height, parts }: { result: NestResultGroup; steps: CutStep[]; width: number; height: number; parts: SheetPartRow[] }) {
  const toPath = (pts: [number, number][]) => pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]} ${p[1]}`).join(" ") + " Z";
  const longest = Math.max(width, height);
  const stepOf = new Map(steps.map((s) => [`${s.partId}#${s.copy}`, s.step]));
  return (
    <svg viewBox={`0 ${-height} ${width} ${height}`} className="h-auto max-h-[44rem] w-full border-2 border-black bg-white" role="img" aria-label="ผังตัดบนแผ่นเหล็ก พร้อมลำดับการตัด">
      <g transform="scale(1,-1)">
        {result.sheet.placed.map((p, i) => {
          const part = parts.find((x) => x.id === p.id)!;
          const [outline, ...holes] = shapesOnSheet(part.geometry.loops, p.rotated);
          const n = stepOf.get(`${p.id}#${p.copy}`) ?? 0;
          const size = Math.min(Math.max(Math.min(p.w, p.h) * 0.42, longest * 0.014), longest * 0.05);
          return (
            <g key={i} transform={`translate(${p.x} ${p.y})`}>
              <path d={toPath(outline)} fill={COLORS[parts.indexOf(part) % COLORS.length]} stroke="#111" strokeWidth={longest * 0.0022} />
              {holes.map((h, k) => (
                <path key={k} d={toPath(h)} fill="#fff" stroke="#111" strokeWidth={longest * 0.0014} />
              ))}
              <g transform={`translate(${p.w / 2} ${p.h / 2}) scale(1,-1)`}>
                <text textAnchor="middle" dominantBaseline="central" fontSize={size} fontWeight="800" fill="#111" stroke="#fff" strokeWidth={size * 0.16} paintOrder="stroke">
                  {n}
                </text>
              </g>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

/** The cutting job as steps: step 1, 2, 3 ... is one sheet layout (cut N sheets of it), and on each sheet the
 *  parts are numbered in the order they are cut, each one holes first and then its outline. */
export default function SteelCutSteps({
  planId,
  planName,
  parts,
  defaultGap,
  canEdit,
  doneBySignature,
  initial,
}: {
  planId: string;
  planName: string;
  parts: SheetPartRow[];
  defaultGap: number;
  canEdit: boolean;
  doneBySignature: Record<string, number>;
  initial: { width: number; height: number; gap: number; rotate: boolean };
}) {
  const matching = SHEET_PRESETS.findIndex((p) => p.width === initial.width && p.height === initial.height);
  const [presetIndex, setPresetIndex] = useState(matching);
  const [customW, setCustomW] = useState(String(initial.width));
  const [customH, setCustomH] = useState(String(initial.height));
  const [gap, setGap] = useState(String(initial.gap));
  const [rotate, setRotate] = useState(initial.rotate);
  const [done, setDone] = useState<Record<string, number>>(doneBySignature);

  const sheetWidth = presetIndex >= 0 ? SHEET_PRESETS[presetIndex].width : Number(customW);
  const sheetHeight = presetIndex >= 0 ? SHEET_PRESETS[presetIndex].height : Number(customH);
  const gapValue = Number.isFinite(Number(gap)) && gap.trim() !== "" ? Number(gap) : defaultGap;
  const valid = sheetWidth > 0 && sheetHeight > 0;

  const job = useMemo(
    () =>
      valid
        ? planSheetJob(
            parts.map((p) => ({ id: p.id, name: p.name, width: p.width, height: p.height, thickness: p.thickness, quantity: p.quantity })),
            { sheetWidth, sheetHeight, gap: gapValue, allowRotate: rotate }
          )
        : [],
    [parts, sheetWidth, sheetHeight, gapValue, rotate, valid]
  );

  const changeDone = async (signature: string, count: number, delta: number) => {
    const next = Math.min(count, Math.max(0, (done[signature] ?? 0) + delta));
    setDone((prev) => ({ ...prev, [signature]: next }));
    const res = await setNestDone(planId, signature, next);
    if (!res.success) setDone((prev) => ({ ...prev, [signature]: done[signature] ?? 0 }));
  };

  // Step numbers run on through all thicknesses.
  const stepStarts: number[] = [];
  job.reduce((n, g) => {
    stepStarts.push(n + 1);
    return n + g.results.length;
  }, 0);
  const totalSheets = job.reduce((n, g) => n + g.results.reduce((m, r) => m + r.count, 0), 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <Link href={`/steel-cutting/${planId}`} className="text-gray-700 hover:text-gray-900" aria-label="กลับไปหน้าแผน">
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">ใบสั่งตัด · {planName}</h1>
        </div>
        <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1 rounded bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-700">
          <Printer className="h-4 w-4" />
          พิมพ์ / PDF
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded border border-orange-200 bg-orange-50 p-3 print:hidden">
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
          <input type="checkbox" className="h-5 w-5 cursor-pointer accent-orange-600" checked={rotate} onChange={(e) => setRotate(e.target.checked)} />
          หมุนชิ้นงาน 90° ได้
        </label>
      </div>

      <div className="hidden print:block">
        <h1 className="text-2xl font-bold">ใบสั่งตัด · {planName}</h1>
      </div>

      {parts.length === 0 && <p className="text-gray-500">ยังไม่มีชิ้นแผ่นจากไฟล์ DXF ในแผนนี้ กลับไปหน้าแผนแล้วโยนไฟล์ DXF (หรือทั้งโฟลเดอร์) ก่อน</p>}
      {valid && parts.length > 0 && (
        <p className="text-base font-semibold text-gray-900">
          ใช้แผ่นเหล็กรวม {totalSheets} แผ่น (แผ่นละ {fmt(sheetWidth)} × {fmt(sheetHeight)} มม.) · {job.reduce((n, g) => n + g.results.length, 0)} ขั้นตอน
        </p>
      )}

      {job.map((group, gi) => (
        <div key={group.thickness ?? "none"} className="space-y-5">
          <h2 className="border-b-4 border-black pb-1 text-2xl font-extrabold text-gray-900">
            {group.thickness !== null ? `หนา ${fmt(group.thickness)} มม.` : "ยังไม่ระบุความหนา (กรอกที่หน้าแผน)"}
          </h2>
          {group.tooBig.length > 0 && <p className="text-sm text-red-600">ใหญ่เกินแผ่น: {group.tooBig.join(", ")}</p>}

          {group.results.map((result, ri) => {
            const stepNo = stepStarts[gi] + ri;
            const holeLists = new Map(parts.map((p) => [p.id, p.features.filter((f) => f.kind === "hole" || f.kind === "slot" || f.kind === "rect" || f.kind === "cutout")]));
            const steps = cutSequence(result.sheet.placed, (id) => holeLists.get(id) ?? []);
            const d = Math.min(done[result.signature] ?? 0, result.count);
            return (
              <section key={result.signature} className="break-inside-avoid rounded-lg border-2 border-black bg-white p-4 print:rounded-none" style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-3 text-xl font-extrabold">
                    <span className="rounded bg-black px-3 py-1 text-white">ขั้นตอนที่ {stepNo}</span>
                    ตัดแผ่นแบบนี้ {result.count} แผ่น
                  </h3>
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <span className={d >= result.count ? "text-green-700" : "text-amber-600"}>
                      ตัดแล้ว {d}/{result.count}
                    </span>
                    {canEdit && (
                      <span className="inline-flex gap-1 print:hidden">
                        <button type="button" title="ตัดแล้วน้อยลง 1" onClick={() => changeDone(result.signature, result.count, -1)} className="rounded border border-gray-300 p-1 text-gray-500 hover:bg-gray-100">
                          <Minus className="h-4 w-4" />
                        </button>
                        <button type="button" title="ตัดเสร็จเพิ่ม 1 แผ่น" onClick={() => changeDone(result.signature, result.count, 1)} className="rounded border border-gray-300 p-1 text-gray-500 hover:bg-gray-100">
                          <Plus className="h-4 w-4" />
                        </button>
                      </span>
                    )}
                  </p>
                </div>
                <p className="mb-2 text-sm text-gray-600">
                  แผ่น {fmt(sheetWidth)} × {fmt(sheetHeight)} มม. · มี {steps.length} ชิ้นบนแผ่น · ตัดตามเลข 1 → {steps.length} (แต่ละชิ้นเจาะรูก่อน แล้วตัดโครงนอก)
                </p>
                <div className="grid gap-4 lg:grid-cols-[1fr_20rem] print:grid-cols-[1fr_16rem]">
                  <SheetDrawing result={result} steps={steps} width={sheetWidth} height={sheetHeight} parts={parts} />
                  <div className="max-h-[44rem] overflow-y-auto print:max-h-none">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-gray-100 text-left">
                        <tr>
                          <th className="px-1.5 py-1">ลำดับ</th>
                          <th className="px-1.5 py-1">ชิ้น</th>
                          <th className="px-1.5 py-1">รู</th>
                        </tr>
                      </thead>
                      <tbody>
                        {steps.map((s) => (
                          <tr key={`${s.partId}#${s.copy}`} className="border-t border-gray-200">
                            <td className="px-1.5 py-1 font-extrabold">{s.step}</td>
                            <td className="px-1.5 py-1">
                              {s.name}
                              <span className="text-gray-400"> #{s.copy}</span>
                              <span className="block text-[10px] text-gray-500">
                                {fmt(s.width)} × {fmt(s.height)} มม.
                              </span>
                            </td>
                            <td className="px-1.5 py-1">
                              {s.holeTotal === 0 ? <span className="text-gray-400">ไม่มีรู</span> : s.holes.map((h) => `${h.size} × ${h.count}`).join(", ")}
                              <span className="block text-[10px] text-gray-500">แล้วตัดโครงนอก</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      ))}

      <p className="text-xs text-gray-400 print:hidden">ลำดับตัดคิดจากตำแหน่งบนแผ่น (เริ่มมุมซ้ายล่าง ไปชิ้นที่ใกล้ที่สุดต่อไปเรื่อย ๆ) ปรับตามเครื่องจริงได้ ผังวางตามกรอบสี่เหลี่ยมของแต่ละชิ้น</p>
    </div>
  );
}
