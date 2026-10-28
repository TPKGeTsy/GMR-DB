"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Printer, Trash2, Plus, Upload } from "lucide-react";
import {
  addSteelParts,
  addSteelStock,
  deleteSteelPart,
  deleteSteelPlan,
  deleteSteelStock,
  updateSteelPlanSettings,
} from "@/app/actions/steel";
import {
  STEEL_TYPES,
  STEEL_TYPE_KEYS,
  parsePartsCsv,
  planCuts,
  profileLabel,
  type SteelType,
} from "@/lib/steel";

export interface EditorPart {
  id: string;
  steelType: string;
  sectionX: number;
  sectionY: number | null;
  cutLength: number;
  quantity: number;
}
export interface EditorStock {
  id: string;
  steelType: string;
  sectionX: number;
  sectionY: number | null;
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
  onType,
  onX,
  onY,
}: {
  type: SteelType;
  x: string;
  y: string;
  onType: (t: SteelType) => void;
  onX: (v: string) => void;
  onY: (v: string) => void;
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
        x (มม.)
        <input type="number" min={0} step="any" value={x} onChange={(e) => onX(e.target.value)} className={inputClass} />
      </label>
      <label className="block text-xs text-gray-500">
        y (มม.)
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
    </>
  );
}

function PartForm({ planId, onDone }: { planId: string; onDone: () => void }) {
  const [type, setType] = useState<SteelType>("BOX");
  const [x, setX] = useState("");
  const [y, setY] = useState("");
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
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <ProfileFields type={type} x={x} y={y} onType={setType} onX={setX} onY={setY} />
        <label className="block text-xs text-gray-500">
          z ความยาวตัด (มม.)
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
  const [type, setType] = useState<SteelType>("BOX");
  const [x, setX] = useState("");
  const [y, setY] = useState("");
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
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <ProfileFields type={type} x={x} y={y} onType={setType} onX={setX} onY={setY} />
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

function CsvImport({ planId, onDone }: { planId: string; onDone: () => void }) {
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const loadFile = async (file: File | undefined) => {
    if (file) setText(await file.text());
  };

  const importRows = async () => {
    const { parts, errors } = parsePartsCsv(text);
    if (parts.length === 0) {
      setMessages(errors.length > 0 ? errors : ["ไม่พบรายการที่อ่านได้"]);
      return;
    }
    setBusy(true);
    const result = await addSteelParts(planId, parts);
    setBusy(false);
    if (!result.success) {
      setMessages([result.error ?? "นำเข้าไม่สำเร็จ"]);
      return;
    }
    setMessages([`นำเข้า ${parts.length} รายการแล้ว${errors.length > 0 ? ` (ข้าม ${errors.length} แถว)` : ""}`, ...errors]);
    setText("");
    onDone();
  };

  return (
    <details className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
      <summary className="cursor-pointer font-medium text-gray-700">
        <Upload className="mr-1 inline h-4 w-4" />
        นำเข้ารายการชิ้นงานจาก CSV / วางจาก Excel
      </summary>
      <div className="mt-2 space-y-2">
        <p className="text-xs text-gray-500">
          1 แถวต่อ 1 รายการ คอลัมน์: <code>ประเภท, x, y, z, จำนวน</code> (คั่นด้วย , ; หรือ Tab) เช่น{" "}
          <code>BOX,50,25,1200,4</code> หรือ <code>เหล็กแบน,50,6,800,2</code> ประเภทเป็นรหัส (BOX FLAT ANGLE ROUND PIPE) หรือชื่อไทยก็ได้
        </p>
        <input type="file" accept=".csv,.txt,.tsv" onChange={(e) => loadFile(e.target.files?.[0])} className="text-xs" />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className={`${inputClass} font-mono`}
          placeholder="BOX,50,25,1200,4"
        />
        <button type="button" onClick={importRows} disabled={busy || !text.trim()} className={buttonClass}>
          นำเข้า
        </button>
        {messages.length > 0 && (
          <ul className="text-xs text-gray-600">
            {messages.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

export default function SteelPlanEditor({
  plan,
  parts,
  stock,
  projects,
  canEdit,
}: {
  plan: { id: string; name: string; kerf: number; newBarLength: number; projectId: string | null };
  parts: EditorPart[];
  stock: EditorStock[];
  projects: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();
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
        kerf: Number.isFinite(kerfValue) ? kerfValue : plan.kerf,
        newBarLength: Number.isFinite(newBarValue) ? newBarValue : plan.newBarLength,
      }),
    [parts, stock, kerfValue, newBarValue, plan.kerf, plan.newBarLength]
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
            ความยาวเหล็กที่ซื้อใหม่ (มม.)
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
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">ชิ้นงานที่ต้องตัด ({parts.length})</h2>
        {parts.length > 0 && (
          <table className="mb-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                <th className="py-1 font-medium">ประเภท / หน้าตัด</th>
                <th className="py-1 text-right font-medium">z ยาว (มม.)</th>
                <th className="py-1 text-right font-medium">จำนวน</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {parts.map((p) => (
                <tr key={p.id} className="border-t border-gray-100">
                  <td className="py-1">{profileLabel(p)}</td>
                  <td className="py-1 text-right">{fmt(p.cutLength)}</td>
                  <td className="py-1 text-right">{p.quantity}</td>
                  <td className="py-1 text-right">
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
          <div className="space-y-3">
            <PartForm planId={plan.id} onDone={refresh} />
            <CsvImport planId={plan.id} onDone={refresh} />
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-100 bg-white p-4 shadow print:hidden">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">เหล็กที่มีอยู่ ({stock.length})</h2>
        {stock.length > 0 && (
          <table className="mb-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                <th className="py-1 font-medium">ประเภท / หน้าตัด</th>
                <th className="py-1 text-right font-medium">ยาว (มม.)</th>
                <th className="py-1 text-right font-medium">จำนวน (เส้น)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {stock.map((s) => (
                <tr key={s.id} className="border-t border-gray-100">
                  <td className="py-1">{profileLabel(s)}</td>
                  <td className="py-1 text-right">{fmt(s.length)}</td>
                  <td className="py-1 text-right">{s.quantity}</td>
                  <td className="py-1 text-right">
                    {canEdit && (
                      <button
                        type="button"
                        title="ลบ"
                        onClick={async () => {
                          await deleteSteelStock(s.id);
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
        {canEdit && <StockForm planId={plan.id} onDone={refresh} />}
        {stock.length === 0 && !canEdit && <p className="text-sm text-gray-400">ยังไม่ได้ใส่เหล็กที่มี</p>}
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
          {plan.name} — ใบเลื่อย {fmt(kerfValue || 0)} มม. — ซื้อเหล็กใหม่ {fmt(newBarValue || 0)} มม./เส้น
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
