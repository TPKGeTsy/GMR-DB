"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { deleteFileParts, deleteSteelPart, setFileRounds, updateSteelPart } from "@/app/actions/steel";
import { profileLabel } from "@/lib/steel";

export interface PartRowData {
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

const cell =
  "w-20 rounded border border-gray-300 px-1.5 py-0.5 text-right text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-gray-50";
const fmt = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 1 });

/** One piece-to-cut row that can be edited after the upload: length, the QTY in the file and the rounds. */
export function PartRow({ part, canEdit, onChanged }: { part: PartRowData; canEdit: boolean; onChanged: () => void }) {
  const base = part.baseQuantity ?? part.quantity;
  const [z, setZ] = useState(String(part.cutLength));
  const [qty, setQty] = useState(String(base));
  const [rounds, setRounds] = useState(String(part.rounds));
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const next = { cutLength: Number(z), baseQuantity: Number(qty), rounds: Number(rounds) };
    if (next.cutLength === part.cutLength && next.baseQuantity === base && next.rounds === part.rounds) return;
    setError(null);
    const res = await updateSteelPart(part.id, next);
    if (!res.success) {
      setError(res.error ?? "บันทึกไม่สำเร็จ");
      return;
    }
    onChanged();
  };

  const total = Math.max(0, Math.floor(Number(qty) || 0) * Math.floor(Number(rounds) || 0));
  return (
    <tr className={`border-t border-gray-100 ${part.quantity === 0 ? "text-gray-300" : ""}`}>
      <td className="px-3 py-1 text-right">
        <input type="number" min={0} step="any" value={z} disabled={!canEdit} onChange={(e) => setZ(e.target.value)} onBlur={save} className={cell} aria-label="ความยาวตัด" />
      </td>
      <td className="px-3 py-1 text-right">
        <input type="number" min={0} step={1} value={qty} disabled={!canEdit} onChange={(e) => setQty(e.target.value)} onBlur={save} className={`${cell} !w-16`} aria-label="QTY" />
      </td>
      <td className="px-3 py-1 text-right">
        <span className="inline-flex items-center gap-1 text-gray-500">
          ×
          <input type="number" min={0} step={1} value={rounds} disabled={!canEdit} onChange={(e) => setRounds(e.target.value)} onBlur={save} className={`${cell} !w-14`} aria-label="จำนวนรอบ" />
        </span>
      </td>
      <td className={`px-3 py-1 text-right font-bold ${part.quantity === 0 ? "line-through" : ""}`}>{total}</td>
      <td className="px-3 py-1 text-left text-xs text-gray-500">
        {part.sourceFile ?? "เพิ่มเอง"}
        {error && <span className="ml-2 text-red-600">{error}</span>}
      </td>
      <td className="px-3 py-1 text-right">
        {canEdit && (
          <button
            type="button"
            title="ลบ"
            onClick={async () => {
              await deleteSteelPart(part.id);
              onChanged();
            }}
            className="text-gray-400 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </td>
    </tr>
  );
}

/** The imported files and the rounds of each (A x2, B x3...), editable after the upload. */
export function ImportedFiles({
  planId,
  parts,
  canEdit,
  onChanged,
}: {
  planId: string;
  parts: PartRowData[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const files = new Map<string, PartRowData[]>();
  for (const p of parts) {
    if (!p.sourceFile) continue;
    files.set(p.sourceFile, [...(files.get(p.sourceFile) ?? []), p]);
  }
  if (files.size === 0) return null;
  return (
    <div className="mb-4 rounded border border-gray-200">
      <p className="border-b border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-600">
        ไฟล์ที่นำเข้า ({files.size}) — แก้จำนวนรอบของทั้งไฟล์ หรือแก้ทีละรายการในตารางด้านล่าง
      </p>
      <ul className="divide-y divide-gray-100">
        {[...files.entries()].map(([name, rows]) => (
          <ImportedFile key={`${name}-${rows.map((r) => `${r.id}:${r.rounds}:${r.quantity}`).join(",")}`} planId={planId} name={name} rows={rows} canEdit={canEdit} onChanged={onChanged} />
        ))}
      </ul>
    </div>
  );
}

function ImportedFile({
  planId,
  name,
  rows,
  canEdit,
  onChanged,
}: {
  planId: string;
  name: string;
  rows: PartRowData[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const same = rows.every((r) => r.rounds === rows[0].rounds);
  const [rounds, setRounds] = useState(same ? String(rows[0].rounds) : "");
  const [error, setError] = useState<string | null>(null);
  const pieces = rows.reduce((n, r) => n + r.quantity, 0);

  const saveRounds = async () => {
    if (rounds.trim() === "") return;
    const n = Number(rounds);
    if (same && n === rows[0].rounds) return;
    setError(null);
    const res = await setFileRounds(planId, name, n);
    if (!res.success) setError(res.error ?? "บันทึกไม่สำเร็จ");
    else onChanged();
  };

  return (
    <li className="px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-gray-400 hover:text-gray-700" aria-label="ดูรายการในไฟล์">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <span className="min-w-0 flex-1 truncate font-medium text-gray-800" title={name}>
          {name}
        </span>
        <span className="text-xs text-gray-500">
          {rows.length} รายการ · {fmt(pieces)} ชิ้น
        </span>
        <span className="inline-flex items-center gap-1 text-gray-600">
          ทั้งไฟล์ ×
          <input
            type="number"
            min={0}
            step={1}
            value={rounds}
            placeholder={same ? undefined : "หลายค่า"}
            disabled={!canEdit}
            onChange={(e) => setRounds(e.target.value)}
            onBlur={saveRounds}
            className={`${cell} !w-16`}
            aria-label={`จำนวนรอบของ ${name}`}
          />
        </span>
        {canEdit && (
          <button
            type="button"
            title="ลบรายการทั้งหมดของไฟล์นี้"
            onClick={async () => {
              if (!confirm(`ลบรายการทั้งหมดที่มาจาก ${name} (${rows.length} รายการ)?`)) return;
              await deleteFileParts(planId, name);
              onChanged();
            }}
            className="text-gray-400 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      {error && <p className="ml-6 text-xs text-red-600">{error}</p>}
      {open && (
        <table className="ml-6 mt-1 text-xs">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="pr-4 font-medium">ประเภท / หน้าตัด</th>
              <th className="pr-4 text-right font-medium">z ยาว</th>
              <th className="pr-4 text-right font-medium">QTY</th>
              <th className="pr-4 text-right font-medium">× รอบ</th>
              <th className="text-right font-medium">รวม</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.quantity === 0 ? "text-gray-300 line-through" : ""}>
                <td className="pr-4">{profileLabel(r)}</td>
                <td className="pr-4 text-right">{fmt(r.cutLength)}</td>
                <td className="pr-4 text-right">{r.baseQuantity ?? r.quantity}</td>
                <td className="pr-4 text-right">{r.rounds}</td>
                <td className="text-right font-semibold">{r.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </li>
  );
}
