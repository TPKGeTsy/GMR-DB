"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Printer, Trash2, Plus, Upload } from "lucide-react";
import {
  parseSteelPdf,
  addSteelParts,
  deleteSteelPart,
  deleteSteelPlan,
  setSteelBarLength,
  updateSteelPlanCutSettings,
  updateSteelPlanSettings,
} from "@/app/actions/steel";
import {
  BAR_LENGTH_OPTIONS,
  STEEL_TYPES,
  STEEL_TYPE_KEYS,
  comparePieces,
  mergeParts,
  parseBomLines,
  parsePartsCsv,
  planCuts,
  profileKey,
  profileLabel,
  type CuttingPlan,
  type SkippedRow,
  type SteelPartInput,
  type SteelType,
} from "@/lib/steel";

export interface EditorPart {
  id: string;
  steelType: string;
  sectionX: number;
  sectionY: number | null;
  thickness: number | null;
  cutLength: number;
  quantity: number;
}
const inputClass =
  "w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";
const buttonClass =
  "inline-flex items-center gap-1 rounded bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50";

const fmt = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 1 });

/** Type + x + y + thickness picker for a piece to cut. */
function ProfileFields({
  type,
  x,
  y,
  t,
  onType,
  onX,
  onY,
  onT,
}: {
  type: SteelType;
  x: string;
  y: string;
  t: string;
  onType: (t: SteelType) => void;
  onX: (v: string) => void;
  onY: (v: string) => void;
  onT: (v: string) => void;
}) {
  const needsY = STEEL_TYPES[type].needsY;
  return (
    <>
      <label className="block text-xs text-gray-500">
        ประเภท
        <select value={type} onChange={(e) => onType(e.target.value as SteelType)} className={inputClass}>
          {STEEL_TYPE_KEYS.map((k) => (
            <option key={k} value={k}>
              {STEEL_TYPES[k].label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs text-gray-500">
        x กว้าง (มม.)
        <input type="number" min={0} step="any" value={x} onChange={(e) => onX(e.target.value)} className={inputClass} />
      </label>
      <label className="block text-xs text-gray-500">
        y ยาว (มม.)
        <input
          type="number"
          min={0}
          step="any"
          value={needsY ? y : ""}
          disabled={!needsY}
          onChange={(e) => onY(e.target.value)}
          className={`${inputClass} disabled:bg-gray-100`}
        />
      </label>
      <label className="block text-xs text-gray-500">
        t หนา (มม.)
        <input type="number" min={0} step="any" value={t} onChange={(e) => onT(e.target.value)} className={inputClass} />
      </label>
    </>
  );
}

function PartForm({ planId, onDone }: { planId: string; onDone: () => void }) {
  const [type, setType] = useState<SteelType>("ST");
  const [x, setX] = useState("");
  const [y, setY] = useState("");
  const [t, setT] = useState("");
  const [z, setZ] = useState("");
  const [qty, setQty] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await addSteelParts(planId, [
      {
        steelType: type,
        sectionX: Number(x),
        sectionY: STEEL_TYPES[type].needsY ? Number(y) : null,
        thickness: t.trim() ? Number(t) : null,
        cutLength: Number(z),
        quantity: Number(qty),
      },
    ]);
    setBusy(false);
    if (!result.success) {
      setError(result.error ?? "เพิ่มไม่สำเร็จ");
      return;
    }
    setZ("");
    onDone();
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        <ProfileFields type={type} x={x} y={y} t={t} onType={setType} onX={setX} onY={setY} onT={setT} />
        <label className="block text-xs text-gray-500">
          z LENGTH ความยาวที่ใช้ (มม.)
          <input type="number" min={0} step="any" value={z} onChange={(e) => setZ(e.target.value)} className={inputClass} />
        </label>
      </div>
      <div className="flex items-end gap-2">
        <label className="block w-24 text-xs text-gray-500">
          จำนวน (ชิ้น)
          <input type="number" min={1} step={1} value={qty} onChange={(e) => setQty(e.target.value)} className={inputClass} />
        </label>
        <button type="submit" disabled={busy} className={buttonClass}>
          <Plus className="h-4 w-4" />
          เพิ่มชิ้นงาน
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </form>
  );
}

function ImportPanel({ planId, onDone }: { planId: string; onDone: () => void }) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<{ parts: SteelPartInput[]; skipped: SkippedRow[] } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Text copied from a drawing's table (ITEM QTY DESCRIPTION LENGTH) or CSV rows.
  const parseText = (source: string): { parts: SteelPartInput[]; skipped: SkippedRow[] } => {
    const bom = parseBomLines(source.split(/\r?\n/));
    if (bom.parts.length > 0) return bom;
    const { parts, errors } = parsePartsCsv(source);
    return { parts, skipped: errors.map((e) => ({ line: e, reason: "" })) };
  };

  const readText = (source: string) => {
    setMessage(null);
    setPreview(parseText(source));
  };

  // Several files at once: every PDF is read on the server, any other file as
  // text/CSV, and everything lands in one preview (same steel + length adds up).
  const handleFiles = async (files: FileList | File[] | null | undefined) => {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;
    setBusy(true);
    setMessage(null);
    setPreview(null);
    const parts: SteelPartInput[] = [];
    const skipped: SkippedRow[] = [];
    const problems: string[] = [];
    for (const file of list) {
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        const form = new FormData();
        form.set("file", file);
        const result = await parseSteelPdf(form);
        if (!result.success) {
          problems.push(`${file.name}: ${result.error}`);
          continue;
        }
        parts.push(...result.parts);
        skipped.push(...result.skipped);
      } else {
        const read = parseText(await file.text());
        parts.push(...read.parts);
        skipped.push(...read.skipped);
      }
    }
    setBusy(false);
    if (problems.length > 0) setMessage(problems.join(" · "));
    if (parts.length > 0 || skipped.length > 0) setPreview({ parts: mergeParts(parts), skipped });
  };

  const [dragging, setDragging] = useState(false);

  const confirmImport = async () => {
    if (!preview || preview.parts.length === 0) return;
    setBusy(true);
    const result = await addSteelParts(planId, preview.parts);
    setBusy(false);
    if (!result.success) {
      setMessage(result.error ?? "นำเข้าไม่สำเร็จ");
      return;
    }
    setMessage(`นำเข้า ${preview.parts.length} รายการแล้ว`);
    setPreview(null);
    setText("");
    onDone();
  };

  return (
    <details className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
      <summary className="cursor-pointer font-medium text-gray-700">
        <Upload className="mr-1 inline h-4 w-4" />
        นำเข้ารายการชิ้นงานจาก PDF (ตาราง BOM) / CSV
      </summary>
      <div className="mt-2 space-y-3">
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
          className={`flex cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed px-3 py-5 text-center text-xs ${
            dragging ? "border-orange-500 bg-orange-50 text-orange-700" : "border-gray-300 bg-white text-gray-500"
          }`}
        >
          <span className="font-medium text-gray-700">ลากไฟล์ PDF / CSV มาวางที่นี่ (หลายไฟล์พร้อมกันได้) หรือคลิกเพื่อเลือกไฟล์</span>
          <span className="mt-1">
            PDF ต้องเป็นแบบมีตัวหนังสือ (ไม่ใช่ภาพสแกน) และมีตาราง ITEM / QTY / DESCRIPTION / LENGTH ระบบเอาเฉพาะแถวที่มี x, y, z
            และ QTY ครบ เรียงเหล็กชนิดเดียวกันไว้ด้วยกัน ตามด้วยความยาวจากมากไปน้อย
          </span>
          <input
            type="file"
            multiple
            accept="application/pdf,.pdf,.csv,.txt,.tsv"
            disabled={busy}
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = "";
            }}
            className="sr-only"
          />
        </label>
        <div>
          <p className="mb-1 text-xs text-gray-500">
            หรือวางข้อความที่ก๊อปจากตารางในแบบ / Excel / CSV เช่น <code>1 16 ST 75 x 75 x 2.3 1742</code> หรือ{" "}
            <code>ประเภท, x, y, z, จำนวน, t</code> เช่น <code>BOX,50,25,1200,4,2.3</code>
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            className={`${inputClass} font-mono`}
            placeholder={"1 16 ST 75 x 75 x 2.3 1742\nBOX,50,25,1200,4,2.3"}
          />
          <button type="button" onClick={() => readText(text)} disabled={busy || !text.trim()} className={`${buttonClass} mt-1`}>
            อ่านข้อมูล
          </button>
        </div>

        {message && <p className="text-xs text-gray-600">{message}</p>}

        {preview && (
          <div className="space-y-2 rounded border border-gray-200 bg-white p-2">
            <p className="text-xs font-semibold text-gray-700">พบ {preview.parts.length} รายการที่ใช้ได้</p>
            {preview.parts.length > 0 && (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-0.5 font-medium">ประเภท / หน้าตัด</th>
                    <th className="py-0.5 text-right font-medium">z ยาว (มม.)</th>
                    <th className="py-0.5 text-right font-medium">QTY (จำนวน)</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.parts.map((p, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="py-0.5">{profileLabel(p)}</td>
                      <td className="py-0.5 text-right">{fmt(p.cutLength)}</td>
                      <td className="py-0.5 text-right">{p.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {preview.skipped.length > 0 && (
              <div className="text-xs text-amber-700">
                <p className="font-semibold">ข้าม {preview.skipped.length} แถว (ข้อมูลไม่ครบ)</p>
                <ul>
                  {preview.skipped.map((k, i) => (
                    <li key={i}>
                      {k.line}
                      {k.reason && ` — ${k.reason}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={confirmImport} disabled={busy || preview.parts.length === 0} className={buttonClass}>
                นำเข้า {preview.parts.length} รายการ
              </button>
              <button type="button" onClick={() => setPreview(null)} className="text-xs text-gray-500 hover:text-gray-700">
                ยกเลิก
              </button>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

type BarProfile = { steelType: string; sectionX: number; sectionY: number | null; thickness: number | null };

/** Bar length choices: 1,000 - 20,000 mm in steps of 1,000. */
function BarLengthSelect({
  value,
  onChange,
  disabled,
  className = "",
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  const options = BAR_LENGTH_OPTIONS.includes(value) ? BAR_LENGTH_OPTIONS : [...BAR_LENGTH_OPTIONS, value].sort((a, b) => a - b);
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`rounded border border-gray-300 px-2 py-1 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 ${className}`}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o.toLocaleString("th-TH")} มม.
        </option>
      ))}
    </select>
  );
}

/** Bar length for one kind of steel: pick from the list (default = the plan's
 *  standard), or tick "custom" and type a length (e.g. an offcut to use up). */
function BarLengthControl({
  planId,
  profile,
  current,
  standard,
  canEdit,
  onDone,
}: {
  planId: string;
  profile: BarProfile;
  current: number | null;
  standard: number;
  canEdit: boolean;
  onDone: () => void;
}) {
  const isListed = (v: number) => BAR_LENGTH_OPTIONS.includes(v);
  const [custom, setCustom] = useState(current !== null && !isListed(current));
  const [value, setValue] = useState(current !== null && !isListed(current) ? String(current) : "");
  const [error, setError] = useState<string | null>(null);

  const save = async (length: number | null) => {
    setError(null);
    const result = await setSteelBarLength(planId, profile, length);
    if (!result.success) {
      setError(result.error ?? "บันทึกไม่สำเร็จ");
      return;
    }
    onDone();
  };

  const picked = current ?? standard;

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
      <span>ความยาวเหล็ก</span>
      {!custom && (
        <BarLengthSelect
          value={isListed(picked) ? picked : standard}
          disabled={!canEdit}
          onChange={(v) => save(v === standard ? null : v)}
        />
      )}
      <label className="inline-flex items-center gap-1 text-xs">
        <input
          type="checkbox"
          checked={custom}
          disabled={!canEdit}
          onChange={(e) => {
            setCustom(e.target.checked);
            if (!e.target.checked) {
              setValue("");
              save(null);
            }
          }}
        />
        กรอกเอง (เช่น เศษเหล็ก)
      </label>
      {custom && (
        <span className="inline-flex items-center gap-1">
          <input
            type="number"
            min={0}
            step="any"
            value={value}
            disabled={!canEdit}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => value.trim() && Number(value) !== current && save(Number(value))}
            onKeyDown={(e) => e.key === "Enter" && value.trim() && save(Number(value))}
            placeholder="มม."
            className={`${inputClass} !w-24`}
          />
          มม.
        </span>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

// Same cut length = same colour. The numbers and the striped kerf / offcut parts
// still read in a black-and-white print.
const PIECE_COLORS = ["#fdba74", "#93c5fd", "#86efac", "#fde047", "#c4b5fd", "#f9a8d4"];
const KERF_STYLE = { background: "repeating-linear-gradient(45deg, #b91c1c 0 3px, #ffffff 3px 6px)" };
const SCRAP_STYLE = { background: "repeating-linear-gradient(135deg, #d1d5db 0 5px, #ffffff 5px 10px)" };

const SIZE_STEPS = [
  { label: "ปกติ", scale: 1 },
  { label: "ใหญ่", scale: 1.3 },
  { label: "ใหญ่มาก", scale: 1.6 },
] as const;

function CutResults({
  planName,
  result,
  kerf,
  standard,
}: {
  planName: string;
  result: CuttingPlan;
  kerf: number;
  standard: number;
}) {
  const [sizeIndex, setSizeIndex] = useState(1);
  const scale = SIZE_STEPS[sizeIndex].scale;
  const barHeight = Math.round(40 * scale);
  const font = Math.round(14 * scale);
  const totalBars = result.profiles.reduce((sum, p) => sum + p.bars.length, 0);

  const exportCsv = () => {
    const rows: string[][] = [["รายการที่", "ชนิดเหล็ก", "ความยาวเหล็ก(มม.)", "ชิ้นที่ตัด(มม.)", "ระยะตัด(มม.)", "เศษเหลือ(มม.)"]];
    let n = 0;
    for (const p of result.profiles) {
      for (const b of p.bars) {
        n += 1;
        rows.push([String(n), p.label, String(b.length), b.cuts.join(" + "), String(kerf), String(b.leftover)]);
      }
    }
    const csv = "﻿" + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${planName || "steel-cutting"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Running item number across all kinds of steel (no restart per group).
  const firstNumber: number[] = [];
  result.profiles.reduce((total, p) => {
    firstNumber.push(total + 1);
    return total + p.bars.length;
  }, 0);
  return (
    <section className="rounded-lg border border-gray-100 bg-white p-4 shadow print:border-0 print:p-0 print:shadow-none">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">ผลการวางแผนตัด</h2>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-gray-500">
            ขนาดแสดงผล
            <select
              value={sizeIndex}
              onChange={(e) => setSizeIndex(Number(e.target.value))}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
            >
              {SIZE_STEPS.map((s, i) => (
                <option key={s.label} value={i}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={exportCsv} disabled={result.profiles.length === 0} className={buttonClass}>
            <Download className="h-4 w-4" />
            CSV
          </button>
          <button type="button" onClick={() => window.print()} disabled={result.profiles.length === 0} className={buttonClass}>
            <Printer className="h-4 w-4" />
            พิมพ์ / PDF
          </button>
        </div>
      </div>

      <div style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}>
        <p className="mb-2 hidden font-semibold print:block" style={{ fontSize: font + 4 }}>
          {planName}
        </p>
        <p className="mb-3 text-gray-700" style={{ fontSize: font }}>
          ระยะตัด (ใบเลื่อย) {fmt(kerf)} มม. · เหล็กมาตรฐาน {fmt(standard)} มม.
        </p>

        {result.profiles.length === 0 ? (
          <p className="text-sm text-gray-400">เพิ่มชิ้นงานเพื่อดูแผนตัด</p>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-gray-700" style={{ fontSize: font }}>
              <span className="font-semibold">ใช้เหล็กรวม {totalBars} เส้น</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-4 w-6 border border-black" style={{ background: PIECE_COLORS[0] }} /> ชิ้นที่ตัด
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-4 w-6 border border-black" style={KERF_STYLE} /> ระยะตัด
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-4 w-6 border border-dashed border-black" style={SCRAP_STYLE} /> เศษ
              </span>
              {result.hasProblem && <span className="text-red-600">มีชิ้นงานยาวเกินความยาวเหล็ก</span>}
            </div>

            {result.profiles.map((p, pi) => {
              const lengths = [...new Set(p.bars.flatMap((b) => b.cuts))].sort((a, b) => b - a);
              return (
                <div key={p.key}>
                  <h3 className="mb-1 font-bold text-gray-900" style={{ fontSize: font + 2 }}>
                    {p.label}
                  </h3>
                  <p className="mb-2 text-gray-600" style={{ fontSize: font - 1 }}>
                    {p.piecesTotal} ชิ้น · ใช้เหล็ก {p.bars.length} เส้น · เศษรวม {fmt(p.wasteLength)} มม.
                  </p>
                  {p.tooLong.length > 0 && (
                    <p className="mb-2 text-red-600" style={{ fontSize: font - 1 }}>
                      ยาวเกินเหล็ก: {p.tooLong.map(fmt).join(", ")} มม.
                    </p>
                  )}
                  <ul className="space-y-3">
                    {p.bars.map((b, i) => {
                      return (
                        <li key={i} className="break-inside-avoid">
                          <div className="mb-1 flex justify-between text-gray-800" style={{ fontSize: font }}>
                            <span className="font-semibold">
                              รายการที่ {firstNumber[pi] + i} · {fmt(b.length)} มม.
                            </span>
                            <span>เศษ {fmt(b.leftover)} มม.</span>
                          </div>
                          <div className="flex w-full overflow-hidden border-2 border-black bg-white" style={{ height: barHeight }}>
                            {b.cuts.map((c, j) => (
                              <Fragment key={j}>
                                {j > 0 && <div className="shrink-0 border-x border-black" style={{ flex: `${kerf} 0 6px`, ...KERF_STYLE }} title={`ระยะตัด ${fmt(kerf)} มม.`} />}
                                <div
                                  style={{ flex: `${c} 1 0`, background: PIECE_COLORS[lengths.indexOf(c) % PIECE_COLORS.length], fontSize: font }}
                                  className="flex min-w-0 items-center justify-center overflow-hidden whitespace-nowrap border-x border-black font-bold text-black"
                                  title={`${fmt(c)} มม.`}
                                >
                                  {fmt(c)}
                                </div>
                              </Fragment>
                            ))}
                            {b.leftover > 0 && (
                              <div
                                style={{ flex: `${b.leftover} 1 0`, ...SCRAP_STYLE, fontSize: font - 2 }}
                                className="flex min-w-0 items-center justify-center overflow-hidden border-l-2 border-dashed border-black whitespace-nowrap text-gray-700"
                                title={`เศษ ${fmt(b.leftover)} มม.`}
                              >
                                {b.leftover / b.length > 0.06 ? `เศษ ${fmt(b.leftover)}` : ""}
                              </div>
                            )}
                          </div>
                          <p className="mt-1 text-gray-800" style={{ fontSize: font }}>
                            {b.cuts.map(fmt).join(" + ")}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export default function SteelPlanEditor({
  plan,
  parts,
  bars,
  projects,
  canEdit,
  skippedCount,
}: {
  plan: { id: string; name: string; kerf: number; newBarLength: number; projectId: string | null };
  parts: EditorPart[];
  bars: (BarProfile & { length: number })[];
  projects: { id: string; name: string }[];
  canEdit: boolean;
  skippedCount: number;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();
  // One group per kind of steel, longest cut first within it.
  const groups = useMemo(() => {
    const map = new Map<string, { profile: EditorPart; parts: EditorPart[] }>();
    for (const p of parts) {
      const key = profileKey(p);
      const g = map.get(key) ?? { profile: p, parts: [] };
      g.parts.push(p);
      map.set(key, g);
    }
    return [...map.values()]
      .map((g) => ({ ...g, parts: [...g.parts].sort(comparePieces) }))
      .sort((a, b) => comparePieces({ ...a.profile, cutLength: 0 }, { ...b.profile, cutLength: 0 }));
  }, [parts]);

  const [name, setName] = useState(plan.name);
  const [kerf, setKerf] = useState(String(plan.kerf));
  const [standard, setStandard] = useState(plan.newBarLength);
  const [projectId, setProjectId] = useState(plan.projectId ?? "");
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);
  const [showSkipped, setShowSkipped] = useState(skippedCount > 0);

  const kerfValue = Number.isFinite(Number(kerf)) && kerf.trim() !== "" ? Number(kerf) : plan.kerf;
  const result = useMemo(
    () =>
      planCuts(parts, [], {
        barLengths: Object.fromEntries(bars.map((b) => [profileKey(b), b.length])),
        kerf: kerfValue,
        newBarLength: standard,
      }),
    [parts, bars, kerfValue, standard]
  );

  const saveCutSettings = async (next: { kerf: number; newBarLength: number }) => {
    const res = await updateSteelPlanCutSettings(plan.id, next);
    setSettingsMsg(res.success ? null : (res.error ?? "บันทึกไม่สำเร็จ"));
    if (res.success) refresh();
  };

  const saveSettings = async () => {
    const res = await updateSteelPlanSettings(plan.id, { name, projectId: projectId || null });
    setSettingsMsg(res.success ? "บันทึกแล้ว" : (res.error ?? "บันทึกไม่สำเร็จ"));
    if (res.success) refresh();
  };

  const removePlan = async () => {
    if (!confirm("ลบแผนนี้ทั้งหมด?")) return;
    const res = await deleteSteelPlan(plan.id);
    if (res.success) router.push("/steel-cutting");
    else alert(res.error ?? "ลบไม่สำเร็จ");
  };

  return (
    <div className="space-y-6">
      {showSkipped && (
        <p className="flex items-center justify-between rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 print:hidden">
          <span>นำเข้าจากไฟล์แล้ว ข้าม {skippedCount} แถวที่ข้อมูล x, y, z หรือ QTY ไม่ครบ</span>
          <button type="button" onClick={() => setShowSkipped(false)} className="text-amber-700 hover:text-amber-900">
            ปิด
          </button>
        </p>
      )}

      <section className="rounded-lg border border-gray-100 bg-white p-4 shadow print:hidden">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block text-xs text-gray-500 sm:col-span-2">
            ชื่อแผน (ไม่บังคับ)
            <input value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} className={inputClass} />
          </label>
          <label className="block text-xs text-gray-500">
            โปรเจกต์
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={!canEdit} className={inputClass}>
              <option value="">— ไม่ผูกโปรเจกต์ —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {canEdit && (
          <div className="mt-3 flex items-center gap-3">
            <button type="button" onClick={saveSettings} className={buttonClass}>
              บันทึก
            </button>
            <button type="button" onClick={removePlan} className="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-700">
              <Trash2 className="h-4 w-4" />
              ลบแผน
            </button>
            {settingsMsg && <span className="text-xs text-gray-500">{settingsMsg}</span>}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-100 bg-white p-4 shadow print:hidden">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">ชิ้นงานที่ต้องตัด ({parts.length})</h2>
        <div className="mb-4 flex flex-wrap items-end gap-4 rounded border border-orange-200 bg-orange-50 p-3">
          <label className="block text-xs text-gray-600">
            ระยะตัด / ใบเลื่อย (มม.)
            <input
              type="number"
              min={0}
              step="any"
              value={kerf}
              disabled={!canEdit}
              onChange={(e) => setKerf(e.target.value)}
              onBlur={() => canEdit && saveCutSettings({ kerf: kerfValue, newBarLength: standard })}
              className={`${inputClass} !w-28`}
            />
          </label>
          <label className="block text-xs text-gray-600">
            ความยาวเหล็กมาตรฐาน
            <div>
              <BarLengthSelect
                value={standard}
                disabled={!canEdit}
                onChange={(v) => {
                  setStandard(v);
                  saveCutSettings({ kerf: kerfValue, newBarLength: v });
                }}
              />
            </div>
          </label>
          <p className="text-xs text-gray-500">ระยะตัดนับทุกรอยตัดในแผนด้านล่าง ความยาวเหล็กเลือกแยกตามชนิดเหล็กได้ในแต่ละกลุ่ม</p>
        </div>

        <div className="space-y-4">
          {groups.map((g) => (
            <div key={profileKey(g.profile)} className="rounded border border-gray-200">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2">
                <h3 className="text-sm font-semibold text-gray-900">{profileLabel(g.profile)}</h3>
                <BarLengthControl
                  planId={plan.id}
                  profile={g.profile}
                  current={bars.find((b) => profileKey(b) === profileKey(g.profile))?.length ?? null}
                  standard={standard}
                  canEdit={canEdit}
                  onDone={refresh}
                />
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500">
                    <th className="px-3 py-1 text-right font-medium">z ยาว (มม.)</th>
                    <th className="px-3 py-1 text-right font-medium">QTY (จำนวน)</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {g.parts.map((p) => (
                    <tr key={p.id} className="border-t border-gray-100">
                      <td className="px-3 py-1 text-right">{fmt(p.cutLength)}</td>
                      <td className="px-3 py-1 text-right">{p.quantity}</td>
                      <td className="px-3 py-1 text-right">
                        {canEdit && (
                          <button
                            type="button"
                            title="ลบ"
                            onClick={async () => {
                              await deleteSteelPart(p.id);
                              refresh();
                            }}
                            className="text-gray-400 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {groups.length === 0 && <p className="text-sm text-gray-400">ยังไม่มีรายการ เพิ่มชิ้นงานหรือนำเข้าจากไฟล์ด้านล่าง</p>}
        </div>
        {canEdit && (
          <div className="mt-4 space-y-3">
            <PartForm planId={plan.id} onDone={refresh} />
            <ImportPanel planId={plan.id} onDone={refresh} />
          </div>
        )}
      </section>

      <CutResults planName={plan.name} result={result} kerf={kerfValue} standard={standard} />
    </div>
  );
}
