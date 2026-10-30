"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Printer, Trash2, Plus, Upload } from "lucide-react";
import BarLengthSelect from "./BarLengthSelect";
import { useDisplayUnit } from "./useDisplayUnit";
import { UNITS, UNIT_KEYS, formatLength, formatLengthWithUnit, type Unit } from "@/lib/units";
import { ImportedFiles, PartRow, applyPartPatch, type PartPatch } from "./SteelPartRows";
import SteelStagedFiles, { finalParts, useStagedFiles } from "./SteelStagedFiles";
import { PrintLayoutProvider, PrintSetupPanel, usePrintSection } from "./PrintLayout";
import {
  addSteelParts,
  deleteFileParts,
  deleteSteelPart,
  deleteSteelPlan,
  setFileRounds,
  updateSteelPart,
  setSteelBarLength,
  updateSteelPlanCutSettings,
  updateSteelPlanSettings,
} from "@/app/actions/steel";
import {
  BAR_LENGTH_OPTIONS,
  STEEL_TYPES,
  STEEL_TYPE_KEYS,
  comparePieces,
  nameRows,
  parseBomLines,
  parsePartsCsv,
  planCuts,
  profileKey,
  profileLabel,
  profileLabelUnits,
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
  note: string | null;
  sourceFile: string | null;
  baseQuantity: number | null;
  rounds: number;
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

  // The dropped files were already read (see useStagedFiles); here their rounds / chosen rows
  // are applied and everything lands in one preview (same steel + length adds up).
  const staged = useStagedFiles();
  const previewFromFiles = () => {
    const ready = staged.items.filter((i) => i.status === "ready");
    if (ready.length === 0) return;
    setMessage(null);
    const parts = ready.flatMap((i) => finalParts(i, staged.state)).sort(comparePieces);
    const skipped: SkippedRow[] = ready.filter((i) => i.skipped > 0).map((i) => ({ line: `${i.file.name}: ข้าม ${i.skipped} แถว`, reason: "ข้อมูลไม่ครบ" }));
    if (parts.length === 0) {
      setMessage("ไม่มีรายการให้นำเข้า (ตรวจจำนวนรอบรายแถว)");
      return;
    }
    setPreview({ parts, skipped });
    staged.clear();
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
        <div className="grid gap-3 md:grid-cols-2">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              staged.add(e.dataTransfer.files);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed px-3 py-8 text-center text-xs ${
              dragging ? "border-orange-500 bg-orange-50 text-orange-700" : "border-gray-300 bg-white text-gray-500"
            }`}
          >
            <span className="font-medium text-gray-700">ลากไฟล์ PDF / CSV มาวางที่นี่ (หลายไฟล์พร้อมกันได้) หรือคลิกเพื่อเลือกไฟล์</span>
            <span className="mt-1">PDF ต้องเป็นแบบมีตัวหนังสือ (ไม่ใช่ภาพสแกน) และมีตาราง ITEM / QTY / DESCRIPTION / LENGTH ระบบเอาเฉพาะแถวที่มี x, y, z และ QTY ครบ</span>
            <input
              type="file"
              multiple
              accept="application/pdf,.pdf,.csv,.txt,.tsv"
              disabled={busy}
              onChange={(e) => {
                staged.add(e.target.files);
                e.target.value = "";
              }}
              className="sr-only"
            />
          </label>
          <div className="space-y-2">
            <SteelStagedFiles staged={staged} disabled={busy} />
            {staged.items.length > 0 && (
              <button
                type="button"
                onClick={previewFromFiles}
                disabled={busy || staged.reading || !staged.items.some((i) => i.status === "ready")}
                className={`${buttonClass} w-full justify-center`}
              >
                {staged.reading ? "กำลังอ่านไฟล์…" : "ดูตัวอย่างก่อนนำเข้า"}
              </button>
            )}
          </div>
        </div>
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

// Space between the items (รายการ), so nothing is squeezed together when printed.
const ROW_GAPS = [
  { label: "แน่น", px: 14 },
  { label: "ปกติ", px: 28 },
  { label: "กว้าง", px: 48 },
  { label: "กว้างมาก", px: 72 },
] as const;

function CutResults({
  planName,
  result,
  kerf,
  standard,
  kerfText,
  onKerfText,
  onKerfCommit,
  canEdit,
  unit,
  labels,
}: {
  planName: string;
  result: CuttingPlan;
  kerf: number;
  standard: number;
  /** The saw-blade kerf as typed - it can be changed right here. */
  kerfText: string;
  onKerfText: (v: string) => void;
  onKerfCommit: () => void;
  canEdit: boolean;
  /** Lengths are shown in this unit (they are stored in mm). */
  unit: Unit;
  /** The steel kinds with their sizes written with units, by profile key. */
  labels: Record<string, string>;
}) {
  const [sizeIndex, setSizeIndex] = useState(1);
  const [gapIndex, setGapIndex] = useState(2);
  const scale = SIZE_STEPS[sizeIndex].scale;
  const rowGap = ROW_GAPS[gapIndex].px;
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

  const print = usePrintSection("bars");
  // Running item number across all kinds of steel (no restart per group).
  const firstNumber: number[] = [];
  result.profiles.reduce((total, p) => {
    firstNumber.push(total + 1);
    return total + p.bars.length;
  }, 0);
  return (
    <section style={print.style} className={`rounded-lg border border-gray-100 bg-white p-4 shadow print:border-0 print:p-0 print:shadow-none ${print.className}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">ผลการวางแผนตัด</h2>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-gray-500">
            ระยะตัด (มม.)
            <input
              type="number"
              min={0}
              step="any"
              value={kerfText}
              disabled={!canEdit}
              onChange={(e) => onKerfText(e.target.value)}
              onBlur={onKerfCommit}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              className="w-16 rounded border border-gray-300 px-2 py-1 text-sm"
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-gray-500">
            ระยะห่างระหว่างรายการ
            <select value={gapIndex} onChange={(e) => setGapIndex(Number(e.target.value))} className="rounded border border-gray-300 px-2 py-1 text-sm">
              {ROW_GAPS.map((g, i) => (
                <option key={g.label} value={i}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1 text-xs text-gray-500">
            ขนาดแสดงผล
            <select value={sizeIndex} onChange={(e) => setSizeIndex(Number(e.target.value))} className="rounded border border-gray-300 px-2 py-1 text-sm">
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
          ระยะตัด (ใบเลื่อย) {formatLengthWithUnit(kerf, unit)} · เหล็กมาตรฐาน {formatLengthWithUnit(standard, unit)}
        </p>

        {result.profiles.length === 0 ? (
          <p className="text-sm text-gray-400">เพิ่มชิ้นงานเพื่อดูแผนตัด</p>
        ) : (
          <div className="flex flex-col" style={{ gap: rowGap }}>
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
                <div key={p.key} className={pi > 0 ? "border-t-4 border-black" : ""} style={{ paddingTop: pi > 0 ? rowGap / 2 : 0 }}>
                  <h3 className="mb-1 font-bold text-gray-900" style={{ fontSize: font + 2 }}>
                    {labels[p.key] ?? p.label}
                  </h3>
                  <p className="mb-3 text-gray-600" style={{ fontSize: font - 1 }}>
                    {p.piecesTotal} ชิ้น · ใช้เหล็ก {p.bars.length} เส้น · เศษรวม {formatLengthWithUnit(p.wasteLength, unit)}
                  </p>
                  {p.tooLong.length > 0 && (
                    <p className="mb-2 text-red-600" style={{ fontSize: font - 1 }}>
                      ยาวเกินเหล็ก: {p.tooLong.map((n) => formatLengthWithUnit(n, unit)).join(", ")}
                    </p>
                  )}
                  <ul className="flex flex-col" style={{ gap: rowGap }}>
                    {p.bars.map((b, i) => (
                      <li key={i} className="break-inside-avoid rounded border-2 border-black bg-white" style={{ padding: Math.round(10 * scale) }}>
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-gray-900" style={{ fontSize: font }}>
                          <span className="flex items-center gap-2 font-bold">
                            <span className="rounded bg-black px-2 py-0.5 text-white">รายการที่ {firstNumber[pi] + i}</span>
                            เหล็กยาว {formatLengthWithUnit(b.length, unit)}
                          </span>
                          <span>เศษ {formatLengthWithUnit(b.leftover, unit)}</span>
                        </div>
                        {/* One block per cut, each only as wide as its own text, wrapping onto a new line when the row is full.
                            The stripes are the saw kerf; what is left of the bar is the last (dashed) block. */}
                        <div className="flex flex-wrap items-stretch gap-y-2" style={{ fontSize: font + 2 }}>
                          {b.cuts.map((c, j) => (
                            <Fragment key={j}>
                              {j > 0 && <span className="mx-1 inline-block w-2 shrink-0 self-stretch border-x border-black" style={KERF_STYLE} title={`ระยะตัด ${formatLengthWithUnit(kerf, unit)}`} aria-hidden />}
                              <span
                                className="inline-flex items-center whitespace-nowrap border-2 border-black px-3 py-1.5 font-bold text-black"
                                style={{ background: PIECE_COLORS[lengths.indexOf(c) % PIECE_COLORS.length] }}
                              >
                                {b.labels[j] && (
                                  <span className="mr-2 rounded bg-black px-1.5 text-white" style={{ fontSize: "0.7em" }}>
                                    {b.labels[j]}
                                  </span>
                                )}
                                {formatLength(c, unit)}
                                <span className="ml-1 font-semibold" style={{ fontSize: "0.7em" }}>
                                  {UNITS[unit].label}
                                </span>
                              </span>
                            </Fragment>
                          ))}
                          {b.leftover > 0 && (
                            <>
                              <span className="mx-1 inline-block w-2 shrink-0 self-stretch border-x border-black" style={KERF_STYLE} aria-hidden />
                              <span className="inline-flex items-center whitespace-nowrap border-2 border-dashed border-black px-3 py-1.5 font-semibold text-gray-700" style={SCRAP_STYLE}>
                                เศษ {formatLengthWithUnit(b.leftover, unit)}
                              </span>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
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
  children,
}: {
  plan: { id: string; name: string; kerf: number; newBarLength: number; projectId: string | null };
  parts: EditorPart[];
  bars: (BarProfile & { length: number })[];
  projects: { id: string; name: string }[];
  canEdit: boolean;
  skippedCount: number;
  /** Extra sections (parts list picture, DXF parts) shown above the results. */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [unit, setUnit] = useDisplayUnit();

  // The parts are edited right here: a change shows (totals, cut plan) the moment it is typed and is
  // saved a moment later. The server copy only replaces this one when the page's data is reloaded.
  const [localParts, setLocalParts] = useState<EditorPart[]>(parts);
  const [serverParts, setServerParts] = useState(parts);
  if (parts !== serverParts) {
    setServerParts(parts);
    setLocalParts(parts);
  }
  const [editError, setEditError] = useState<string | null>(null);
  const pending = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const partPatches = useRef(new Map<string, PartPatch>());
  const refreshWanted = useRef(false);

  // A reload while saves are waiting would show old numbers, so it waits for them.
  const refresh = () => {
    if (pending.current.size > 0) refreshWanted.current = true;
    else router.refresh();
  };

  const saveLater = (key: string, run: () => Promise<{ success: boolean; error?: string }>) => {
    const earlier = pending.current.get(key);
    if (earlier) clearTimeout(earlier);
    pending.current.set(
      key,
      setTimeout(async () => {
        pending.current.delete(key);
        const res = await run();
        setEditError(res.success ? null : (res.error ?? "บันทึกไม่สำเร็จ"));
        if (!res.success) router.refresh(); // show what is really saved
        else if (pending.current.size === 0 && refreshWanted.current) {
          refreshWanted.current = false;
          router.refresh();
        }
      }, 500)
    );
  };

  const editPart = (id: string, patch: PartPatch) => {
    setLocalParts((prev) => prev.map((p) => (p.id === id ? applyPartPatch(p, patch) : p)));
    partPatches.current.set(id, { ...(partPatches.current.get(id) ?? {}), ...patch });
    saveLater(`part:${id}`, async () => {
      const merged = partPatches.current.get(id) ?? patch;
      partPatches.current.delete(id);
      return updateSteelPart(id, merged);
    });
  };

  const editFileRounds = (file: string, rounds: number) => {
    setLocalParts((prev) => prev.map((p) => (p.sourceFile === file ? applyPartPatch(p, { rounds }) : p)));
    saveLater(`file:${file}`, () => setFileRounds(plan.id, file, rounds));
  };

  const removePart = async (id: string) => {
    setLocalParts((prev) => prev.filter((p) => p.id !== id));
    const res = await deleteSteelPart(id);
    if (!res.success) {
      setEditError(res.error ?? "ลบไม่สำเร็จ");
      router.refresh();
    }
  };

  const removeFile = async (file: string) => {
    setLocalParts((prev) => prev.filter((p) => p.sourceFile !== file));
    const res = await deleteFileParts(plan.id, file);
    if (!res.success) {
      setEditError(res.error ?? "ลบไม่สำเร็จ");
      router.refresh();
    }
  };

  // ST1, ST2, ST3 ... and L1, L2 ... : a name per row, counted per kind of steel over the whole plan.
  // Rows are listed by name, so a row does not jump away while its length is being typed.
  const names = useMemo(() => nameRows(localParts), [localParts]);

  // One group per kind of steel, rows by file name first and then the longest cut.
  const groups = useMemo(() => {
    const map = new Map<string, { profile: EditorPart; parts: EditorPart[] }>();
    for (const p of localParts) {
      const key = profileKey(p);
      const g = map.get(key) ?? { profile: p, parts: [] };
      g.parts.push(p);
      map.set(key, g);
    }
    return [...map.values()]
      .map((g) => ({ ...g, parts: [...g.parts].sort((a, b) => (names.get(a.id) ?? "").localeCompare(names.get(b.id) ?? "", "en", { numeric: true }) || b.cutLength - a.cutLength) }))
      .sort((a, b) => comparePieces({ ...a.profile, cutLength: 0 }, { ...b.profile, cutLength: 0 }));
  }, [localParts, names]);

  const [name, setName] = useState(plan.name);
  const [kerf, setKerf] = useState(String(plan.kerf));
  const [standard, setStandard] = useState(plan.newBarLength);
  const [projectId, setProjectId] = useState(plan.projectId ?? "");
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);
  const [showSkipped, setShowSkipped] = useState(skippedCount > 0);

  // The steel kinds written with their sizes in the shown unit, by profile key (for the cut results).
  const labels = useMemo(() => Object.fromEntries(groups.map((g) => [profileKey(g.profile), profileLabelUnits(g.profile, unit)])), [groups, unit]);

  const kerfValue = Number.isFinite(Number(kerf)) && kerf.trim() !== "" ? Number(kerf) : plan.kerf;
  const result = useMemo(
    () =>
      planCuts(localParts.map((p) => ({ ...p, label: names.get(p.id) ?? null })), [], {
        barLengths: Object.fromEntries(bars.map((b) => [profileKey(b), b.length])),
        kerf: kerfValue,
        newBarLength: standard,
      }),
    [localParts, names, bars, kerfValue, standard]
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
    <PrintLayoutProvider planId={plan.id}>
    <div className="flex flex-col gap-6">
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
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">ชิ้นงานที่ต้องตัด ({localParts.length})</h2>
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
          <label className="block text-xs text-gray-600">
            หน่วยที่แสดง
            <div>
              <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)} className="rounded border border-gray-300 px-2 py-1 text-sm">
                {UNIT_KEYS.map((u) => (
                  <option key={u} value={u}>
                    {UNITS[u].label}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <p className="text-xs text-gray-500">ข้อมูลที่นำเข้าเป็น มม. เสมอ หน่วยนี้เปลี่ยนแค่การแสดงผล (และช่องความยาวในตาราง) · ระยะตัดนับทุกรอยตัดในแผนด้านล่าง</p>
        </div>

        {editError && <p className="mb-2 text-sm text-red-600">{editError}</p>}
        <ImportedFiles parts={localParts} unit={unit} canEdit={canEdit} onFileRounds={editFileRounds} onDeleteFile={removeFile} />

        <div className="space-y-4">
          {groups.map((g) => (
            <div key={profileKey(g.profile)} className="rounded border border-gray-200">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2">
                <h3 className="text-sm font-semibold text-gray-900">
                  {profileLabelUnits(g.profile, unit)}
                  <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-800">
                    รวม {g.parts.reduce((n, p) => n + p.quantity, 0).toLocaleString("th-TH")} ชิ้น
                  </span>
                </h3>
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
                    <th className="px-3 py-1 text-left font-medium">ชื่อ</th>
                    <th className="px-3 py-1 text-right font-medium">z ยาว ({UNITS[unit].label})</th>
                    <th className="px-3 py-1 text-right font-medium">QTY ในไฟล์</th>
                    <th className="px-3 py-1 text-right font-medium">× รอบ</th>
                    <th className="px-3 py-1 text-right font-medium">รวม (ชิ้น)</th>
                    <th className="px-3 py-1 text-left font-medium">จากไฟล์</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {g.parts.map((p) => (
                    <PartRow key={`${p.id}-${unit}`} part={p} name={names.get(p.id) ?? ""} unit={unit} canEdit={canEdit} onEdit={(patch) => editPart(p.id, patch)} onDelete={() => removePart(p.id)} />
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

      <PrintSetupPanel />

      {children}

      <CutResults
        planName={plan.name}
        result={result}
        kerf={kerfValue}
        standard={standard}
        kerfText={kerf}
        onKerfText={setKerf}
        onKerfCommit={() => canEdit && saveCutSettings({ kerf: kerfValue, newBarLength: standard })}
        canEdit={canEdit}
        unit={unit}
        labels={labels}
      />
    </div>
    </PrintLayoutProvider>
  );
}
