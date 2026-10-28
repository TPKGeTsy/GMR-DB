"use client";

import { useCallback, useRef, useState } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { parseSteelPdf } from "@/app/actions/steel";
import { parseBomLines, parsePartsCsv, profileLabel, type SteelPartInput } from "@/lib/steel";

export interface StagedFile {
  key: string;
  file: File;
  /** Rounds of the whole file, as typed. */
  times: string;
  /** Count only some rows: each row then has its own number of rounds (0 = leave it out). */
  partial: boolean;
  rowTimes: string[];
  status: "reading" | "ready" | "error";
  parts: SteelPartInput[];
  skipped: number;
  error: string | null;
}

export interface TimesState {
  /** One number for every file (true) or one per file (false). */
  same: boolean;
  common: string;
}

export const DEFAULT_TIMES_STATE: TimesState = { same: false, common: "1" };

const MAX_TIMES = 1000;

const wholeNumber = (text: string, min: number): number => {
  const n = Math.floor(Number(text));
  return Number.isFinite(n) ? Math.min(MAX_TIMES, Math.max(min, n)) : min === 0 ? 1 : min;
};

/** Rounds of the whole file: what was typed (or the common number), at least 1. */
export function timesFor(item: StagedFile, state: TimesState): number {
  return wholeNumber(state.same ? state.common : item.times, 1);
}

/** Rounds of one row in "some rows" mode: at least 0 (0 leaves the row out). */
export function rowTimesFor(item: StagedFile, index: number): number {
  return wholeNumber(item.rowTimes[index] ?? "1", 0);
}

/** The pieces of a file after its rounds: the whole file x N, or each chosen row x its own number. */
export function finalParts(item: StagedFile, state: TimesState): SteelPartInput[] {
  if (item.status !== "ready") return [];
  const base = item.file.name.replace(/\.[^.]+$/, "");
  if (!item.partial) {
    const times = timesFor(item, state);
    const label = base + (times > 1 ? ` ×${times}` : "");
    return item.parts.map((p) => ({ ...p, quantity: p.quantity * times, sources: [label] }));
  }
  return item.parts
    .map((p, i) => {
      const times = rowTimesFor(item, i);
      return { ...p, quantity: p.quantity * times, sources: [base + (times > 1 ? ` ×${times}` : "")] };
    })
    .filter((p) => p.quantity > 0);
}

/** A file's rows: a PDF is read on the server, anything else as text / CSV. */
async function readFileParts(file: File): Promise<{ parts: SteelPartInput[]; skipped: number } | string> {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const form = new FormData();
    form.set("file", file);
    const read = await parseSteelPdf(form);
    return read.success ? { parts: read.parts, skipped: read.skipped.length } : read.error;
  }
  const text = await file.text();
  const bom = parseBomLines(text.split(/\r?\n/));
  if (bom.parts.length > 0) return { parts: bom.parts, skipped: bom.skipped.length };
  const csv = parsePartsCsv(text);
  if (csv.parts.length === 0) return "ไม่พบรายการที่ใช้ได้ในไฟล์";
  return { parts: csv.parts, skipped: csv.errors.length };
}

/** Files waiting to be used: read as soon as they are dropped, so the rows can be
 *  shown and given "rounds" (A x 2, B x 3, C x 1, or only some rows of a file). */
export function useStagedFiles() {
  const [items, setItems] = useState<StagedFile[]>([]);
  const [state, setState] = useState<TimesState>(DEFAULT_TIMES_STATE);
  // Keys of the files already taken (so dropping the same file twice does nothing).
  const seen = useRef<Set<string>>(new Set());

  const add = useCallback(async (files: FileList | File[] | null | undefined) => {
    const fresh = Array.from(files ?? [])
      .map((file) => ({ file, key: `${file.name}|${file.size}|${file.lastModified}` }))
      .filter((f) => !seen.current.has(f.key));
    if (fresh.length === 0) return;
    fresh.forEach((f) => seen.current.add(f.key));
    setItems((prev) => [
      ...prev,
      ...fresh.map<StagedFile>(({ file, key }) => ({ key, file, times: "1", partial: false, rowTimes: [], status: "reading", parts: [], skipped: 0, error: null })),
    ]);
    for (const { file, key } of fresh) {
      const read = await readFileParts(file);
      setItems((prev) =>
        prev.map((s) =>
          s.key !== key
            ? s
            : typeof read === "string"
              ? { ...s, status: "error", error: read }
              : { ...s, status: "ready", parts: read.parts, skipped: read.skipped, rowTimes: read.parts.map(() => "1") }
        )
      );
    }
  }, []);

  const update = (key: string, patch: Partial<StagedFile>) => setItems((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const remove = (key: string) => {
    seen.current.delete(key);
    setItems((prev) => prev.filter((s) => s.key !== key));
  };
  const clear = () => {
    seen.current.clear();
    setItems([]);
  };
  const reading = items.some((s) => s.status === "reading");

  return { items, state, setState, add, update, remove, clear, reading };
}

const inputClass =
  "w-16 rounded border border-gray-300 px-1.5 py-1 text-center text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";

function FileCard({
  item,
  state,
  onUpdate,
  onRemove,
  disabled,
}: {
  item: StagedFile;
  state: TimesState;
  onUpdate: (patch: Partial<StagedFile>) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rowsOpen = open || item.partial;
  const used = item.partial ? item.parts.filter((_, i) => rowTimesFor(item, i) > 0).length : item.parts.length;
  return (
    <li className="py-2 text-sm">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={item.status !== "ready"}
          className="shrink-0 text-gray-400 hover:text-gray-700 disabled:opacity-30"
          aria-label="ดูรายการในไฟล์"
        >
          {rowsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <span className="min-w-0 flex-1 truncate font-medium text-gray-800" title={item.file.name}>
          {item.file.name}
        </span>
        {item.status === "reading" && <span className="shrink-0 text-xs text-gray-400">กำลังอ่าน…</span>}
        {item.status === "ready" && !item.partial &&
          (state.same ? (
            <span className="shrink-0 text-gray-500">× {timesFor(item, state)}</span>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1 text-gray-600">
              ×
              <input
                type="number"
                min={1}
                step={1}
                value={item.times}
                disabled={disabled}
                onChange={(e) => onUpdate({ times: e.target.value })}
                className={inputClass}
                aria-label={`จำนวนรอบของ ${item.file.name}`}
              />
            </span>
          ))}
        <button type="button" title="เอาไฟล์นี้ออก" disabled={disabled} onClick={onRemove} className="shrink-0 text-gray-400 hover:text-red-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      {item.status === "error" && <p className="ml-6 mt-0.5 text-xs text-red-600">{item.error}</p>}
      {item.status === "ready" && (
        <div className="ml-6 mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-gray-500">
          <span>
            {item.partial ? `ใช้ ${used} จาก ${item.parts.length} รายการ` : `${item.parts.length} รายการ`}
            {item.skipped > 0 && ` · ข้าม ${item.skipped} แถว`}
          </span>
          <label className="inline-flex items-center gap-1 text-gray-700">
            <input
              type="checkbox"
              checked={item.partial}
              disabled={disabled}
              onChange={(e) => {
                onUpdate({ partial: e.target.checked });
                if (e.target.checked) setOpen(true);
              }}
            />
            เลือกนับเฉพาะบางรายการ (ระบุรอบรายแถว)
          </label>
        </div>
      )}

      {item.status === "ready" && rowsOpen && (
        <div className="ml-6 mt-1 max-h-72 overflow-auto rounded border border-gray-200">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-2 py-1 font-medium">ประเภท / หน้าตัด</th>
                <th className="px-2 py-1 text-right font-medium">z ยาว</th>
                <th className="px-2 py-1 text-right font-medium">QTY</th>
                {item.partial && <th className="px-2 py-1 text-right font-medium">× รอบ</th>}
              </tr>
            </thead>
            <tbody>
              {item.parts.map((p, i) => {
                const times = item.partial ? rowTimesFor(item, i) : 1;
                return (
                  <tr key={i} className={`border-t border-gray-100 ${item.partial && times === 0 ? "text-gray-300 line-through" : ""}`}>
                    <td className="px-2 py-1">{profileLabel(p)}</td>
                    <td className="px-2 py-1 text-right">{p.cutLength.toLocaleString("th-TH", { maximumFractionDigits: 1 })}</td>
                    <td className="px-2 py-1 text-right">{p.quantity}</td>
                    {item.partial && (
                      <td className="px-2 py-1 text-right">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={item.rowTimes[i] ?? "1"}
                          disabled={disabled}
                          onChange={(e) => onUpdate({ rowTimes: item.rowTimes.map((t, j) => (j === i ? e.target.value : t)) })}
                          className={`${inputClass} !w-14 !py-0.5`}
                          aria-label={`จำนวนรอบของแถวที่ ${i + 1}`}
                        />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </li>
  );
}

/** List of the files waiting to be used, each with its rounds (A x 2, B x 3, C x 1...) and its rows. */
export default function SteelStagedFiles({
  staged,
  disabled,
}: {
  staged: ReturnType<typeof useStagedFiles>;
  disabled?: boolean;
}) {
  const { items, state, setState, update, remove } = staged;
  if (items.length === 0) {
    return (
      <div className="flex h-full min-h-[8rem] items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-center text-xs text-gray-400">
        ไฟล์ที่วางจะแสดงตรงนี้ พร้อมรายการในไฟล์ ใส่ &quot;กี่รอบ&quot; ของแต่ละไฟล์ได้ (เช่น A × 2, B × 3, C × 1) หรือเลือกนับเฉพาะบางรายการ
      </div>
    );
  }
  return (
    <div className="space-y-1 rounded-lg border border-gray-200 bg-white p-3">
      <label className="flex flex-wrap items-center gap-2 text-xs text-gray-700">
        <input type="checkbox" checked={state.same} disabled={disabled} onChange={(e) => setState({ ...state, same: e.target.checked })} />
        ทุกไฟล์ใช้จำนวนรอบเท่ากัน
        {state.same && (
          <span className="inline-flex items-center gap-1">
            ×
            <input
              type="number"
              min={1}
              step={1}
              value={state.common}
              disabled={disabled}
              onChange={(e) => setState({ ...state, common: e.target.value })}
              className={inputClass}
              aria-label="จำนวนรอบของทุกไฟล์"
            />
          </span>
        )}
      </label>
      <ul className="divide-y divide-gray-100">
        {items.map((item) => (
          <FileCard key={item.key} item={item} state={state} onUpdate={(patch) => update(item.key, patch)} onRemove={() => remove(item.key)} disabled={disabled} />
        ))}
      </ul>
    </div>
  );
}
