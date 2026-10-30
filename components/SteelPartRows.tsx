"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { profileLabelUnits } from "@/lib/steel";
import { UNITS, formatLengthWithUnit, fromUnit, toUnit, type Unit } from "@/lib/units";

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

export interface PartPatch {
  cutLength?: number;
  baseQuantity?: number;
  rounds?: number;
}

const MAX_QTY = 10000;

/** The row after an edit: QTY x rounds is what gets cut (0 rounds = left out). */
export function applyPartPatch<T extends PartRowData>(part: T, patch: PartPatch): T {
  const baseQuantity = patch.baseQuantity ?? part.baseQuantity ?? part.quantity;
  const rounds = patch.rounds ?? part.rounds;
  return {
    ...part,
    cutLength: patch.cutLength ?? part.cutLength,
    baseQuantity,
    rounds,
    quantity: Math.max(0, Math.min(MAX_QTY, baseQuantity * rounds)),
  };
}

const cell =
  "w-20 rounded border border-gray-300 px-1.5 py-0.5 text-right text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-gray-50";
const fmt = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 1 });

/** A whole, non-negative number from what was typed, or null while the box is empty / not valid. */
function wholeOrNull(text: string): number | null {
  if (text.trim() === "") return null;
  const n = Number(text);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** One piece-to-cut row, editable at any time: length, the QTY in the file and the rounds.
 *  Every valid keystroke goes up at once, so the totals and the cut plan change as you type. */
export function PartRow({
  part,
  unit,
  canEdit,
  onEdit,
  onDelete,
  error,
}: {
  part: PartRowData;
  /** The length is shown and typed in this unit (stored in mm). */
  unit: Unit;
  canEdit: boolean;
  onEdit: (patch: PartPatch) => void;
  onDelete: () => void;
  error?: string | null;
}) {
  const base = part.baseQuantity ?? part.quantity;
  const [z, setZ] = useState(String(Number(toUnit(part.cutLength, unit).toFixed(4))));
  const [qty, setQty] = useState(String(base));
  const [rounds, setRounds] = useState(String(part.rounds));

  return (
    <tr className={`border-t border-gray-100 ${part.quantity === 0 ? "text-gray-300" : ""}`}>
      <td className="px-3 py-1 text-right">
        <input
          type="number"
          min={0}
          step="any"
          value={z}
          disabled={!canEdit}
          onChange={(e) => {
            setZ(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value.trim() !== "" && n > 0) onEdit({ cutLength: Math.round(fromUnit(n, unit) * 1000) / 1000 });
          }}
          className={cell}
          aria-label={`ความยาวตัด (${UNITS[unit].label})`}
        />
      </td>
      <td className="px-3 py-1 text-right">
        <input
          type="number"
          min={0}
          step={1}
          value={qty}
          disabled={!canEdit}
          onChange={(e) => {
            setQty(e.target.value);
            const n = wholeOrNull(e.target.value);
            if (n !== null) onEdit({ baseQuantity: n });
          }}
          className={`${cell} !w-16`}
          aria-label="QTY"
        />
      </td>
      <td className="px-3 py-1 text-right">
        <span className="inline-flex items-center gap-1 text-gray-500">
          ×
          <input
            type="number"
            min={0}
            step={1}
            value={rounds}
            disabled={!canEdit}
            onChange={(e) => {
              setRounds(e.target.value);
              const n = wholeOrNull(e.target.value);
              if (n !== null) onEdit({ rounds: n });
            }}
            className={`${cell} !w-14`}
            aria-label="จำนวนรอบ"
          />
        </span>
      </td>
      <td className={`px-3 py-1 text-right font-bold ${part.quantity === 0 ? "line-through" : ""}`}>{part.quantity}</td>
      <td className="px-3 py-1 text-left text-xs text-gray-500">
        {part.sourceFile ?? "เพิ่มเอง"}
        {error && <span className="ml-2 text-red-600">{error}</span>}
      </td>
      <td className="px-3 py-1 text-right">
        {canEdit && (
          <button type="button" title="ลบ" onClick={onDelete} className="text-gray-400 hover:text-red-600">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </td>
    </tr>
  );
}

/** The imported files and the rounds of each (A x2, B x3...). Changing a number updates the totals and
 *  the cut plan at once; it is saved a moment later. */
export function ImportedFiles({
  parts,
  unit,
  canEdit,
  onFileRounds,
  onDeleteFile,
}: {
  parts: PartRowData[];
  unit: Unit;
  canEdit: boolean;
  onFileRounds: (file: string, rounds: number) => void;
  onDeleteFile: (file: string) => void;
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
        ไฟล์ที่นำเข้า ({files.size}) — แก้จำนวนรอบของทั้งไฟล์ได้เลย ตัวเลขและแผนตัดเปลี่ยนทันที หรือแก้ทีละรายการในตารางด้านล่าง
      </p>
      <ul className="divide-y divide-gray-100">
        {[...files.entries()].map(([name, rows]) => (
          <ImportedFile key={name} name={name} rows={rows} unit={unit} canEdit={canEdit} onFileRounds={onFileRounds} onDeleteFile={onDeleteFile} />
        ))}
      </ul>
    </div>
  );
}

function ImportedFile({
  name,
  rows,
  unit,
  canEdit,
  onFileRounds,
  onDeleteFile,
}: {
  name: string;
  rows: PartRowData[];
  unit: Unit;
  canEdit: boolean;
  onFileRounds: (file: string, rounds: number) => void;
  onDeleteFile: (file: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const same = rows.every((r) => r.rounds === rows[0].rounds);
  const current = same ? String(rows[0].rounds) : "";
  const [text, setText] = useState(current);
  // When the rounds change elsewhere (a row edited below), the box follows; an empty box stays empty while typing.
  const [lastCurrent, setLastCurrent] = useState(current);
  if (current !== lastCurrent) {
    setLastCurrent(current);
    setText(current);
  }
  const pieces = rows.reduce((n, r) => n + r.quantity, 0);

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
            value={text}
            placeholder={same ? undefined : "หลายค่า"}
            disabled={!canEdit}
            onChange={(e) => {
              setText(e.target.value);
              const n = wholeOrNull(e.target.value);
              if (n !== null && n <= 1000) onFileRounds(name, n);
            }}
            className={`${cell} !w-16`}
            aria-label={`จำนวนรอบของ ${name}`}
          />
        </span>
        {canEdit && (
          <button
            type="button"
            title="ลบรายการทั้งหมดของไฟล์นี้"
            onClick={() => {
              if (!confirm(`ลบรายการทั้งหมดที่มาจาก ${name} (${rows.length} รายการ)?`)) return;
              onDeleteFile(name);
            }}
            className="text-gray-400 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
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
                <td className="pr-4">{profileLabelUnits(r, unit)}</td>
                <td className="pr-4 text-right">{formatLengthWithUnit(r.cutLength, unit)}</td>
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
