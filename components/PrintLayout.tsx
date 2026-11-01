"use client";

import { createContext, useContext, useMemo, useState, useSyncExternalStore } from "react";
import { ArrowDown, ArrowUp, GripVertical, Printer } from "lucide-react";

export const PRINT_SECTIONS = [
  { id: "bars", label: "แผนตัดเหล็กเส้น / กล่อง / ฉาก" },
  { id: "dxfParts", label: "ชิ้นแผ่นจาก DXF (ภาพ + ลำดับการตัด)" },
  { id: "nesting", label: "วางชิ้นลงแผ่นเหล็ก" },
  { id: "hardware", label: "รายการน็อต / สกรู" },
] as const;

export type PrintSectionId = (typeof PRINT_SECTIONS)[number]["id"];

/** How the pages are filled: the paper, which way it is turned, how many columns the bars are set in and whether each kind of steel starts a new sheet. */
export interface PagePrefs {
  paper: "A4" | "A3";
  landscape: boolean;
  columns: 1 | 2 | 3;
  newPagePerHeading: boolean;
}

export const DEFAULT_PAGE_PREFS: PagePrefs = { paper: "A4", landscape: false, columns: 1, newPagePerHeading: false };

interface PrintLayoutValue {
  order: PrintSectionId[];
  included: Record<PrintSectionId, boolean>;
  /** Print in black and white (colours turned to grey). */
  mono: boolean;
  page: PagePrefs;
  setOrder: (order: PrintSectionId[]) => void;
  setIncluded: (id: PrintSectionId, value: boolean) => void;
  setMono: (value: boolean) => void;
  setPage: (patch: Partial<PagePrefs>) => void;
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

interface SavedLayout {
  order: PrintSectionId[];
  included: Record<PrintSectionId, boolean>;
  mono: boolean;
  page: PagePrefs;
}

function parseLayout(raw: string): SavedLayout {
  if (!raw) return { order: DEFAULT_ORDER, included: DEFAULT_INCLUDED, mono: false, page: DEFAULT_PAGE_PREFS };
  try {
    const saved = JSON.parse(raw) as { order?: string[]; included?: Record<string, boolean>; mono?: boolean; page?: Partial<PagePrefs> };
    const known = (saved.order ?? []).filter((id): id is PrintSectionId => DEFAULT_ORDER.includes(id as PrintSectionId));
    // Sections added later still show up, at the end.
    return {
      order: [...known, ...DEFAULT_ORDER.filter((id) => !known.includes(id))],
      included: { ...DEFAULT_INCLUDED, ...(saved.included as Record<PrintSectionId, boolean> | undefined) },
      mono: saved.mono === true,
      page: {
        paper: saved.page?.paper === "A3" ? "A3" : "A4",
        landscape: saved.page?.landscape === true,
        columns: saved.page?.columns === 2 || saved.page?.columns === 3 ? saved.page.columns : 1,
        newPagePerHeading: saved.page?.newPagePerHeading === true,
      },
    };
  } catch {
    return { order: DEFAULT_ORDER, included: DEFAULT_INCLUDED, mono: false, page: DEFAULT_PAGE_PREFS };
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
    const save = (next: SavedLayout) => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Storage can be blocked; the choice then lasts only until reload.
      }
      window.dispatchEvent(new Event(CHANGED_EVENT));
    };
    return {
      order: layout.order,
      included: layout.included,
      mono: layout.mono,
      page: layout.page,
      setOrder: (order) => save({ ...layout, order }),
      setIncluded: (id, v) => save({ ...layout, included: { ...layout.included, [id]: v } }),
      setMono: (mono) => save({ ...layout, mono }),
      setPage: (patch) => save({ ...layout, page: { ...layout.page, ...patch } }),
    };
  }, [layout, storageKey]);

  const { paper, landscape, columns } = layout.page;
  // The paper size is what the print box starts with; the columns and page breaks are classes the plan's printout uses.
  const css = `@media print { @page { size: ${paper} ${landscape ? "landscape" : "portrait"}; margin: 8mm; } .steel-print-cols { display: block; column-count: ${columns}; column-gap: 14px; } .steel-print-cols > li { margin-bottom: 12px; break-inside: avoid; } .steel-print-new-page { break-before: page; page-break-before: always; } }`;

  return (
    <PrintLayoutContext.Provider value={value}>
      <style>{css}</style>
      {children}
    </PrintLayoutContext.Provider>
  );
}

/** The page settings for the printout (class names to put on the bar lists and headings). */
export function usePagePrefs(): PagePrefs {
  return useContext(PrintLayoutContext)?.page ?? DEFAULT_PAGE_PREFS;
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
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded border border-gray-200 bg-gray-50 p-2 text-sm text-gray-700">
        <label className="flex items-center gap-1">
          กระดาษ
          <select value={ctx.page.paper} onChange={(e) => ctx.setPage({ paper: e.target.value === "A3" ? "A3" : "A4" })} className="rounded border border-gray-300 px-2 py-1">
            <option value="A4">A4</option>
            <option value="A3">A3</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          แนว
          <select value={ctx.page.landscape ? "landscape" : "portrait"} onChange={(e) => ctx.setPage({ landscape: e.target.value === "landscape" })} className="rounded border border-gray-300 px-2 py-1">
            <option value="portrait">แนวตั้ง</option>
            <option value="landscape">แนวนอน</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          แผนตัดเรียงกี่คอลัมน์
          <select
            value={ctx.page.columns}
            onChange={(e) => ctx.setPage({ columns: Number(e.target.value) === 3 ? 3 : Number(e.target.value) === 2 ? 2 : 1 })}
            className="rounded border border-gray-300 px-2 py-1"
          >
            <option value={1}>1 (เต็มความกว้าง)</option>
            <option value={2}>2 คอลัมน์</option>
            <option value={3}>3 คอลัมน์</option>
          </select>
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" className="h-4 w-4 accent-orange-600" checked={ctx.page.newPagePerHeading} onChange={(e) => ctx.setPage({ newPagePerHeading: e.target.checked })} />
          แต่ละหัวข้อ (ชนิดเหล็ก) ขึ้นหน้าใหม่ — แจกช่างทีละหัวข้อ
        </label>
        <p className="basis-full text-xs text-gray-400">
          ขนาดกระดาษและแนวถูกส่งไปที่หน้าต่างพิมพ์เป็นค่าเริ่มต้น (ถ้าจะให้เครื่องพิมพ์ย่อ 2 หน้าลงกระดาษ A3 ให้เลือก A4 แนวตั้งที่นี่ แล้วตั้ง &quot;หลายหน้าต่อแผ่น = 2&quot; ในหน้าต่างพิมพ์)
        </p>
      </div>
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
