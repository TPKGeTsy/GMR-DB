"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Printer, Trash2, Plus, Upload } from "lucide-react";
import {
  parseSteelPdf,
  addSteelParts,
  addSteelStock,
  deleteSteelPart,
  deleteSteelPlan,
  deleteSteelStock,
  setSteelBarLength,
  updateSteelPlanSettings,
} from "@/app/actions/steel";
import {
  STEEL_TYPES,
  STEEL_TYPE_KEYS,
  comparePieces,
  parseBomLines,
  parsePartsCsv,
  planCuts,
  profileKey,
  profileLabel,
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
export interface EditorStock {
  id: string;
  steelType: string;
  sectionX: number;
  sectionY: number | null;
  thickness: number | null;
  length: number;
  quantity: number;
}

const inputClass =
  "w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";
const buttonClass =
  "inline-flex items-center gap-1 rounded bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50";

const fmt = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 1 });

/** Type + x + y picker shared by the "piece" and "stock" forms. */
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

function StockForm({ planId, onDone }: { planId: string; onDone: () => void }) {
  const [type, setType] = useState<SteelType>("ST");
  const [x, setX] = useState("");
  const [y, setY] = useState("");
  const [t, setT] = useState("");
  const [len, setLen] = useState("6000");
  const [qty, setQty] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await addSteelStock(planId, {
      steelType: type,
      sectionX: Number(x),
      sectionY: STEEL_TYPES[type].needsY ? Number(y) : null,
      thickness: t.trim() ? Number(t) : null,
      length: Number(len),
      quantity: Number(qty),
    });
    setBusy(false);
    if (!result.success) {
      setError(result.error ?? "เพิ่มไม่สำเร็จ");
      return;
    }
    onDone();
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        <ProfileFields type={type} x={x} y={y} t={t} onType={setType} onX={setX} onY={setY} onT={setT} />
        <label className="block text-xs text-gray-500">
          ความยาวเหล็กที่มี (มม.)
          <input type="number" min={0} step="any" value={len} onChange={(e) => setLen(e.target.value)} className={inputClass} />
        </label>
      </div>
      <div className="flex items-end gap-2">
        <label className="block w-24 text-xs text-gray-500">
          จำนวน (เส้น)
          <input type="number" min={1} step={1} value={qty} onChange={(e) => setQty(e.target.value)} className={inputClass} />
        </label>
        <button type="submit" disabled={busy} className={buttonClass}>
          <Plus className="h-4 w-4" />
          เพิ่มเหล็กที่มี
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </form>
  );
}

/** "Standard bar" tick for one kind of steel: ticked = the plan's standard
 *  length (6,000 mm); unticked = type your own length. */
function BarLengthControl({
  planId,
  profile,
  current,
  standard,
  canEdit,
  onDone,
}: {
  planId: string;
  profile: { steelType: string; sectionX: number; sectionY: number | null; thickness: number | null };
  current: number | null;
  standard: number;
  canEdit: boolean;
  onDone: () => void;
}) {
  const [custom, setCustom] = useState(current !== null);
  const [value, setValue] = useState(current !== null ? String(current) : "");
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

  const toggle = async (standardChecked: boolean) => {
    setCustom(!standardChecked);
    if (standardChecked) {
      setValue("");
      await save(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-700">
      <label className="inline-flex items-center gap-1">
        <input type="checkbox" checked={!custom} disabled={!canEdit} onChange={(e) => toggle(e.target.checked)} />
        เหล็กยาวมาตรฐาน {fmt(standard)} มม.
      </label>
      {custom && (
        <span className="inline-flex items-center gap-1">
          ยาว
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
      {error && <span className="text-red-600">{error}</span>}
    </div>
  );
}

/** Adds bars on hand for a kind of steel that is already on screen - the type,
 *  size and thickness come from the group, so only length and count are typed. */
function StockInline({
  planId,
  profile,
  onDone,
}: {
  planId: string;
  profile: { steelType: string; sectionX: number; sectionY: number | null; thickness: number | null };
  onDone: () => void;
}) {
  const [len, setLen] = useState("");
  const [qty, setQty] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await addSteelStock(planId, {
      steelType: profile.steelType,
      sectionX: profile.sectionX,
      sectionY: profile.sectionY,
      thickness: profile.thickness,
      length: Number(len),
      quantity: Number(qty),
    });
    setBusy(false);
    if (!result.success) {
      setError(result.error ?? "เพิ่มไม่สำเร็จ");
      return;
    }
    setLen("");
    setQty("1");
    onDone();
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-gray-500">เพิ่มเหล็กที่มี ยาว</span>
      <input type="number" min={0} step="any" value={len} onChange={(e) => setLen(e.target.value)} placeholder="มม." className={`${inputClass} !w-20`} />
      <span className="text-gray-500">×</span>
      <input type="number" min={1} step={1} value={qty} onChange={(e) => setQty(e.target.value)} className={`${inputClass} !w-14`} />
      <span className="text-gray-500">เส้น</span>
      <button type="submit" disabled={busy || !len.trim()} className="rounded bg-gray-700 px-2 py-1 font-semibold text-white hover:bg-gray-800 disabled:opacity-50">
        เพิ่ม
      </button>
      {error && <span className="text-red-600">{error}</span>}
    </form>
  );
}

function ImportPanel({ planId, onDone }: { planId: string; onDone: () => void }) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<{ parts: SteelPartInput[]; skipped: SkippedRow[] } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const readPdf = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    setPreview(null);
    const form = new FormData();
    form.set("file", file);
    const result = await parseSteelPdf(form);
    setBusy(false);
    if (!result.success) {
      setMessage(result.error);
      return;
    }
    setPreview({ parts: result.parts, skipped: result.skipped });
  };

  // Text copied from a drawing's table (ITEM QTY DESCRIPTION LENGTH) or CSV rows.
  const readText = (source: string) => {
    setMessage(null);
    const bom = parseBomLines(source.split(/\r?\n/));
    if (bom.parts.length > 0) {
      setPreview({ parts: bom.parts, skipped: bom.skipped });
      return;
    }
    const { parts, errors } = parsePartsCsv(source);
    setPreview({ parts, skipped: errors.map((e) => ({ line: e, reason: "" })) });
  };

  // A PDF is read on the server; any other file is treated as text/CSV.
  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      await readPdf(file);
      return;
    }
    const content = await file.text();
    setText(content);
    readText(content);
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
            handleFile(e.dataTransfer.files?.[0]);
          }}
          className={`flex cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed px-3 py-5 text-center text-xs ${
            dragging ? "border-orange-500 bg-orange-50 text-orange-700" : "border-gray-300 bg-white text-gray-500"
          }`}
        >
          <span className="font-medium text-gray-700">ลากไฟล์ PDF / CSV มาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์</span>
          <span className="mt-1">
            PDF ต้องเป็นแบบมีตัวหนังสือ (ไม่ใช่ภาพสแกน) และมีตาราง ITEM / QTY / DESCRIPTION / LENGTH ระบบเอาเฉพาะแถวที่มี x, y, z
            และ QTY ครบ เรียงเหล็กชนิดเดียวกันไว้ด้วยกัน ตามด้วยความยาวจากมากไปน้อย
          </span>
          <input
            type="file"
            accept="application/pdf,.pdf,.csv,.txt,.tsv"
            disabled={busy}
            onChange={(e) => {
              handleFile(e.target.files?.[0]);
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

export default function SteelPlanEditor({
  plan,
  parts,
  stock,
  bars,
  projects,
  canEdit,
}: {
  plan: { id: string; name: string; kerf: number; newBarLength: number; projectId: string | null };
  parts: EditorPart[];
  stock: EditorStock[];
  bars: { steelType: string; sectionX: number; sectionY: number | null; thickness: number | null; length: number }[];
  projects: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();
  // One group per kind of steel: its pieces to cut (longest first) and the bars on hand.
  const groups = useMemo(() => {
    const map = new Map<string, { profile: EditorPart | EditorStock; parts: EditorPart[]; stock: EditorStock[] }>();
    const groupFor = (item: EditorPart | EditorStock) => {
      const key = profileKey(item);
      let g = map.get(key);
      if (!g) {
        g = { profile: item, parts: [], stock: [] };
        map.set(key, g);
      }
      return g;
    };
    for (const p of parts) groupFor(p).parts.push(p);
    for (const st of stock) groupFor(st).stock.push(st);
    const asPiece = (g: { profile: EditorPart | EditorStock }) => ({ ...g.profile, cutLength: 0 });
    return [...map.values()]
      .map((g) => ({ ...g, parts: [...g.parts].sort(comparePieces), stock: [...g.stock].sort((a, b) => b.length - a.length) }))
      .sort((a, b) => comparePieces(asPiece(a), asPiece(b)));
  }, [parts, stock]);
  const [name, setName] = useState(plan.name);
  const [kerf, setKerf] = useState(String(plan.kerf));
  const [newBar, setNewBar] = useState(String(plan.newBarLength));
  const [projectId, setProjectId] = useState(plan.projectId ?? "");
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);

  const kerfValue = Number(kerf);
  const newBarValue = Number(newBar);
  const result = useMemo(
    () =>
      planCuts(parts, stock, {
        barLengths: Object.fromEntries(bars.map((b) => [profileKey(b), b.length])),
        kerf: Number.isFinite(kerfValue) ? kerfValue : plan.kerf,
        newBarLength: Number.isFinite(newBarValue) ? newBarValue : plan.newBarLength,
      }),
    [parts, stock, bars, kerfValue, newBarValue, plan.kerf, plan.newBarLength]
  );

  const saveSettings = async () => {
    const res = await updateSteelPlanSettings(plan.id, {
      name,
      kerf: kerfValue,
      newBarLength: newBarValue,
      projectId: projectId || null,
    });
    setSettingsMsg(res.success ? "บันทึกแล้ว" : (res.error ?? "บันทึกไม่สำเร็จ"));
    if (res.success) refresh();
  };

  const removePlan = async () => {
    if (!confirm("ลบแผนนี้ทั้งหมด?")) return;
    const res = await deleteSteelPlan(plan.id);
    if (res.success) router.push("/steel-cutting");
    else alert(res.error ?? "ลบไม่สำเร็จ");
  };

  const exportCsv = () => {
    const rows: string[][] = [["ประเภท/หน้าตัด", "เส้นที่", "ที่มา", "ความยาวเหล็ก(มม.)", "ชิ้นที่ตัด(มม.)", "เศษเหลือ(มม.)"]];
    for (const p of result.profiles) {
      p.bars.forEach((b, i) => {
        rows.push([p.label, String(i + 1), b.source === "stock" ? "มีในสต็อก" : "ซื้อใหม่", String(b.length), b.cuts.join(" + "), String(b.leftover)]);
      });
    }
    const csv = "﻿" + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${plan.name || "steel-cutting"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-100 bg-white p-4 shadow print:hidden">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">ตั้งค่าแผน</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <label className="block text-xs text-gray-500 sm:col-span-2">
            ชื่อแผน
            <input value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} className={inputClass} />
          </label>
          <label className="block text-xs text-gray-500">
            ความหนาใบเลื่อย (มม./รอยตัด)
            <input type="number" min={0} step="any" value={kerf} onChange={(e) => setKerf(e.target.value)} disabled={!canEdit} className={inputClass} />
          </label>
          <label className="block text-xs text-gray-500">
            ความยาวเหล็กมาตรฐาน (มม.)
            <input type="number" min={0} step="any" value={newBar} onChange={(e) => setNewBar(e.target.value)} disabled={!canEdit} className={inputClass} />
          </label>
          <label className="block text-xs text-gray-500 sm:col-span-2">
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
              บันทึกการตั้งค่า
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
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-gray-500">
          ชิ้นงานที่ต้องตัด ({parts.length}) และเหล็กที่มี ({stock.length})
        </h2>
        <p className="mb-3 text-xs text-gray-400">
          จัดกลุ่มตามชนิดเหล็ก ในกลุ่มเรียงความยาวจากมากไปน้อย ใส่ความยาวเหล็กที่มีไว้ในกลุ่มเดียวกัน ถ้าไม่ใส่ ระบบถือว่าซื้อใหม่ตามความยาวที่ตั้งไว้ด้านบน
        </p>
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={profileKey(g.profile)} className="rounded border border-gray-200">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2">
                <h3 className="text-sm font-semibold text-gray-900">{profileLabel(g.profile)}</h3>
                <BarLengthControl
                  planId={plan.id}
                  profile={g.profile}
                  current={bars.find((b) => profileKey(b) === profileKey(g.profile))?.length ?? null}
                  standard={Number.isFinite(newBarValue) && newBarValue > 0 ? newBarValue : plan.newBarLength}
                  canEdit={canEdit}
                  onDone={refresh}
                />
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-600">
                  {g.stock.length === 0 ? (
                    <span className="text-gray-400">ไม่มีเหล็กในสต็อก (ซื้อใหม่)</span>
                  ) : (
                    g.stock.map((st) => (
                      <span key={st.id} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 ring-1 ring-gray-300">
                        มี {fmt(st.length)} มม. × {st.quantity} เส้น
                        {canEdit && (
                          <button
                            type="button"
                            title="ลบ"
                            onClick={async () => {
                              await deleteSteelStock(st.id);
                              refresh();
                            }}
                            className="text-gray-400 hover:text-red-600"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </span>
                    ))
                  )}
                </div>
              </div>
              {g.parts.length > 0 && (
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
              )}
              {canEdit && (
                <div className="border-t border-gray-100 px-3 py-2">
                  <StockInline planId={plan.id} profile={g.profile} onDone={refresh} />
                </div>
              )}
            </div>
          ))}
          {groups.length === 0 && <p className="text-sm text-gray-400">ยังไม่มีรายการ เพิ่มชิ้นงานหรือนำเข้าจากไฟล์ด้านล่าง</p>}
        </div>
        {canEdit && (
          <div className="mt-4 space-y-3">
            <PartForm planId={plan.id} onDone={refresh} />
            <ImportPanel planId={plan.id} onDone={refresh} />
            <details className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
              <summary className="cursor-pointer font-medium text-gray-700">เพิ่มเหล็กที่มีของชนิดที่ยังไม่มีชิ้นงาน</summary>
              <div className="mt-2">
                <StockForm planId={plan.id} onDone={refresh} />
              </div>
            </details>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-100 bg-white p-4 shadow">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">ผลการวางแผนตัด</h2>
          <div className="flex gap-2 print:hidden">
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
        <p className="mb-3 hidden text-sm print:block">
          {plan.name} — ใบเลื่อย {fmt(kerfValue || 0)} มม. — เหล็กมาตรฐาน {fmt(newBarValue || 0)} มม./เส้น
        </p>

        {result.profiles.length === 0 ? (
          <p className="text-sm text-gray-400">เพิ่มชิ้นงานเพื่อดูแผนตัด</p>
        ) : (
          <div className="space-y-5">
            <p className="text-sm font-medium text-gray-800">
              {result.totalToBuy > 0 ? `ต้องซื้อเหล็กเพิ่มรวม ${result.totalToBuy} เส้น` : "เหล็กที่มีพอสำหรับทุกชิ้นงาน"}
              {result.hasProblem && <span className="ml-2 text-red-600">— มีชิ้นงานยาวเกินเหล็กที่มี</span>}
            </p>
            {result.profiles.map((p) => (
              <div key={p.key} className="break-inside-avoid">
                <h3 className="text-sm font-semibold text-gray-900">{p.label}</h3>
                <p className="mb-2 text-xs text-gray-500">
                  {p.piecesTotal} ชิ้น · ใช้เหล็กที่มี {p.stockUsed} เส้น · ซื้อเพิ่ม {p.toBuy} เส้น · เศษรวม {fmt(p.wasteLength)} มม.
                  {p.stockUnused > 0 && ` · เหล็กที่มีเหลือไม่ได้ใช้ ${p.stockUnused} เส้น`}
                </p>
                {p.tooLong.length > 0 && (
                  <p className="mb-2 text-xs text-red-600">ยาวเกินเหล็ก: {p.tooLong.map(fmt).join(", ")} มม.</p>
                )}
                <ul className="space-y-1.5">
                  {p.bars.map((b, i) => (
                    <li key={i} className="text-xs">
                      <div className="mb-0.5 flex justify-between text-gray-500">
                        <span>
                          เส้นที่ {i + 1} · {b.source === "stock" ? "มีในสต็อก" : "ซื้อใหม่"} · {fmt(b.length)} มม.
                        </span>
                        <span>เศษ {fmt(b.leftover)} มม.</span>
                      </div>
                      <div className="flex h-6 w-full overflow-hidden rounded border border-gray-300 bg-gray-100">
                        {b.cuts.map((c, j) => (
                          <div
                            key={j}
                            style={{ width: `${(c / b.length) * 100}%` }}
                            className="flex items-center justify-center overflow-hidden border-r border-white bg-orange-300 text-[10px] text-gray-900"
                            title={`${fmt(c)} มม.`}
                          >
                            {fmt(c)}
                          </div>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
