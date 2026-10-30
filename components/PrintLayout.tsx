"use client";

import { createContext, useContext, useMemo, useState, useSyncExternalStore } from "react";
import { ArrowDown, ArrowUp, GripVertical, Printer } from "lucide-react";

export const PRINT_SECTIONS = [
  { id: "bars", label: "แผนตัดเหล็กเส้น / กล่อง / ฉาก" },
  { id: "dxfParts", label: "ชิ้นแผ่นจาก DXF (ภาพ + ลำดับการตัด)" },
  { id: "nesting", label: "วางชิ้นลงแผ่นเหล็ก (Result)" },
  { id: "hardware", label: "รายการน็อต / สกรู" },
] as const;

export type PrintSectionId = (typeof PRINT_SECTIONS)[number]["id"];

interface PrintLayoutValue {
  order: PrintSectionId[];
  included: Record<PrintSectionId, boolean>;
  /** Print in black and white (colours turned to grey). */
  mono: boolean;
  setOrder: (order: PrintSectionId[]) => void;
  setIncluded: (id: PrintSectionId, value: boolean) => void;
  setMono: (value: boolean) => void;
}

const DEFAULT_ORDER = PRINT_SECTIONS.map((s) => s.id) as PrintSectionId[];
const DEFAULT_INCLUDED = Object.fromEntries(DEFAULT_ORDER.map((id) => [id, true])) as Record<PrintSectionId, boolean>;

const PrintLayoutContext = createContext<PrintLayoutValue | null>(null);

const CHANGED_EVENT = "steel-print-layout-changed";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED_EVENT, onChange);
  };
}

function parseLayout(raw: string): { order: PrintSectionId[]; included: Record<PrintSectionId, boolean>; mono: boolean } {
  if (!raw) return { order: DEFAULT_ORDER, included: DEFAULT_INCLUDED, mono: false };
  try {
    const saved = JSON.parse(raw) as { order?: string[]; included?: Record<string, boolean>; mono?: boolean };
    const known = (saved.order ?? []).filter((id): id is PrintSectionId => DEFAULT_ORDER.includes(id as PrintSectionId));
    // Sections added later still show up, at the end.
    return {
      order: [...known, ...DEFAULT_ORDER.filter((id) => !known.includes(id))],
      included: { ...DEFAULT_INCLUDED, ...(saved.included as Record<PrintSectionId, boolean> | undefined) },
      mono: saved.mono === true,
    };
  } catch {
    return { order: DEFAULT_ORDER, included: DEFAULT_INCLUDED, mono: false };
  }
}

/** Which sections are printed and in what order, remembered per plan in this browser. */
export function PrintLayoutProvider({ planId, children }: { planId: string; children: React.ReactNode }) {
  const storageKey = `steel-print-${planId}`;
  // The server and the first paint use the defaults; the saved choice is read from the browser after that.
  const raw = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return window.localStorage.getItem(storageKey) ?? "";
      } catch {
        return "";
      }
    },
    () => ""
  );
  const layout = useMemo(() => parseLayout(raw), [raw]);

  const value = useMemo<PrintLayoutValue>(() => {
    const save = (order: PrintSectionId[], included: Record<PrintSectionId, boolean>, mono: boolean) => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify({ order, included, mono }));
      } catch {
        // Storage can be blocked; the choice then lasts only until reload.
      }
      window.dispatchEvent(new Event(CHANGED_EVENT));
    };
    return {
      order: layout.order,
      included: layout.included,
      mono: layout.mono,
      setOrder: (next) => save(next, layout.included, layout.mono),
      setIncluded: (id, v) => save(layout.order, { ...layout.included, [id]: v }, layout.mono),
      setMono: (v) => save(layout.order, layout.included, v),
    };
  }, [layout, storageKey]);

  return <PrintLayoutContext.Provider value={value}>{children}</PrintLayoutContext.Provider>;
}

/** Put `style` and `className` on a printable section: its place in the order and
 *  hidden in the print when the user switched it off. Outside a provider: no change. */
export function usePrintSection(id: PrintSectionId): { style: React.CSSProperties | undefined; className: string } {
  const ctx = useContext(PrintLayoutContext);
  if (!ctx) return { style: undefined, className: "" };
  return { style: { order: 10 + ctx.order.indexOf(id) * 10 }, className: `${ctx.included[id] ? "" : "print:hidden"} ${ctx.mono ? "print:grayscale" : ""}`.trim() };
}

/** The "what to print and in which order" box: tick, drag, or use the arrows. */
export function PrintSetupPanel() {
  const ctx = useContext(PrintLayoutContext);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  if (!ctx) return null;
  const label = (id: PrintSectionId) => PRINT_SECTIONS.find((s) => s.id === id)!.label;

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= ctx.order.length) return;
    const next = [...ctx.order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    ctx.setOrder(next);
  };

  return (
    <section className="rounded-lg border border-gray-100 bg-white p-4 shadow print:hidden">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">เลือกสิ่งที่จะพิมพ์ และลำดับ</h2>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1 rounded bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-700"
        >
          <Printer className="h-4 w-4" />
          พิมพ์ / PDF
        </button>
      </div>
      <p className="mb-2 text-xs text-gray-400">ติ๊กเพื่อใส่ในใบพิมพ์ ลากที่ไอคอนด้านซ้าย (หรือกดลูกศร) เพื่อเปลี่ยนลำดับ ลำดับเดียวกันนี้ใช้กับหน้าจอด้วย</p>
      <label className="mb-2 inline-flex cursor-pointer select-none items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:border-orange-400 has-[:checked]:border-orange-500 has-[:checked]:bg-orange-50">
        <input type="checkbox" className="h-5 w-5 cursor-pointer accent-orange-600" checked={ctx.mono} onChange={(e) => ctx.setMono(e.target.checked)} />
        พิมพ์สีขาวดำ
      </label>
      <ol className="space-y-1">
        {ctx.order.map((id, index) => (
          <li
            key={id}
            draggable
            onDragStart={() => setDragFrom(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragFrom !== null) move(dragFrom, index);
              setDragFrom(null);
            }}
            onDragEnd={() => setDragFrom(null)}
            className={`flex items-center gap-2 rounded border px-2 py-1.5 text-sm ${dragFrom === index ? "border-orange-400 bg-orange-50" : "border-gray-200 bg-white"}`}
          >
            <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-gray-400" aria-hidden />
            <span className="w-5 text-xs font-bold text-gray-400">{index + 1}</span>
            <label className="flex flex-1 cursor-pointer items-center gap-2">
              <input type="checkbox" checked={ctx.included[id]} onChange={(e) => ctx.setIncluded(id, e.target.checked)} />
              <span className={ctx.included[id] ? "text-gray-900" : "text-gray-400 line-through"}>{label(id)}</span>
            </label>
            <button type="button" title="ขึ้น" disabled={index === 0} onClick={() => move(index, index - 1)} className="rounded p-0.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30">
              <ArrowUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="ลง"
              disabled={index === ctx.order.length - 1}
              onClick={() => move(index, index + 1)}
              className="rounded p-0.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
            >
              <ArrowDown className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
