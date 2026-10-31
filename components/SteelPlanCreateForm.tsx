"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Plus, X } from "lucide-react";
import { createSteelPlan, createSteelPlanWithParts } from "@/app/actions/steel";
import {
  DEFAULT_KERF_MM,
  DEFAULT_NEW_BAR_LENGTH_MM,
  STEEL_TYPES,
  STEEL_TYPE_KEYS,
  comparePieces,
  matchesSizeFilter,
  parseSizeFilter,
  type SteelPartInput,
  type SteelType,
} from "@/lib/steel";
import BarLengthSelect from "./BarLengthSelect";
import { filesFromDrop, isDataFile } from "@/lib/dropFiles";
import SteelStagedFiles, { finalParts, rememberedTimes, timesFor, useStagedFiles } from "./SteelStagedFiles";
import { importHardwarePdf, setHardwareFileRounds } from "@/app/actions/steelSources";
import { smartImportFile } from "@/app/actions/steelSmartImport";

/** Everything the create box takes: data files read here (PDF / CSV) and files sent to the new plan as they are (DXF, pictures). */
const isAccepted = (f: File) => isDataFile(f) || /\.(dxf|png|jpe?g|webp)$/i.test(f.name);

const fieldClass =
  "w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";

// BOX is only the "not specified" type kept for older plans.
const PICKABLE_TYPES = STEEL_TYPE_KEYS.filter((k) => k !== "BOX");

/** Start a plan: set the options first (saw kerf, bar length, which steel to
 *  take), then drop one or many drawing PDFs / CSVs on the box. Several files
 *  are added up into one plan (same steel + length -> quantities summed) or
 *  made into one plan per file. No name needed ("Untitled (n)"). */
export default function SteelPlanCreateForm({ projects }: { projects: { id: string; name: string }[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [kerf, setKerf] = useState(String(DEFAULT_KERF_MM));
  const [barLength, setBarLength] = useState(DEFAULT_NEW_BAR_LENGTH_MM);
  const [types, setTypes] = useState<Set<SteelType>>(new Set(PICKABLE_TYPES));
  const [sizes, setSizes] = useState("");
  const [mergeAll, setMergeAll] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const staged = useStagedFiles();
  // DXF files and pictures wait here; they are imported into the plan once it exists.
  const [extras, setExtras] = useState<File[]>([]);
  const addDropped = (files: ArrayLike<File> | null | undefined) => {
    const all = Array.from(files ?? []);
    const rejected = all.filter((f) => !isAccepted(f));
    staged.add(all.filter(isDataFile));
    setExtras((prev) => {
      const key = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;
      const seen = new Set(prev.map(key));
      return [...prev, ...all.filter((f) => !isDataFile(f) && isAccepted(f) && !seen.has(key(f)))];
    });
    setError(rejected.length > 0 ? `ไม่รู้จักไฟล์ ${rejected.length} ไฟล์ (รองรับ PDF, CSV, DXF, รูป PNG/JPG/WEBP): ${rejected.slice(0, 3).map((f) => f.name).join(", ")}` : null);
  };

  const kerfValue = Number.isFinite(Number(kerf)) && kerf.trim() !== "" ? Number(kerf) : DEFAULT_KERF_MM;
  const options = { kerf: kerfValue, newBarLength: barLength };

  const createEmpty = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await createSteelPlan(name, projectId || null, options);
    if (!result.success) {
      setError(result.error);
      setBusy(false);
      return;
    }
    router.push(`/steel-cutting/${result.id}`);
  };

  // The files were read when they were dropped; here the rounds / chosen rows are applied,
  // the steel filter is applied, and the plan(s) are created.
  const createFromFiles = async () => {
    const ready = staged.items.filter((i) => i.status === "ready");
    // Steel rows make the plan; the screws / nuts / washers of a parts list and the DXF files and pictures go into it.
    const list = ready.filter((i) => i.parts.length > 0);
    const hardwareFiles = ready.filter((i) => i.hardware > 0);
    const side = extras;
    if (list.length === 0 && side.length === 0 && hardwareFiles.length === 0) return;
    setBusy(true);
    setError(null);
    setNote(null);
    const sizeFilter = parseSizeFilter(sizes);
    const wanted = (p: SteelPartInput) => types.has(p.steelType as SteelType) && matchesSizeFilter(p, sizeFilter);

    const perFile: { name: string; parts: SteelPartInput[]; skipped: number }[] = [];
    const problems: string[] = [];
    let leftOut = 0;
    for (const item of list) {
      const all = finalParts(item, staged.state);
      const kept = all.filter(wanted);
      leftOut += all.length - kept.length;
      if (kept.length === 0) {
        problems.push(`${item.file.name}: ไม่มีรายการที่ใช้ได้ (ตรวจชุดรายแถว และตัวเลือกชนิด/ขนาดเหล็กด้านบน)`);
        continue;
      }
      perFile.push({ name: item.file.name, parts: kept, skipped: item.skipped });
    }

    // One plan for everything (quantities of the same steel added up), or one per file.
    const groups =
      mergeAll || perFile.length === 1
        ? perFile.length > 0
          ? [
              {
                name: perFile.length === 1 ? name : "",
                parts: perFile.flatMap((f) => f.parts).sort(comparePieces),
                skipped: perFile.reduce((n, f) => n + f.skipped, 0),
              },
            ]
          : []
        : perFile.map((f) => ({ name: "", parts: [...f.parts].sort(comparePieces), skipped: f.skipped }));

    for (const i of ready) if (i.parts.length === 0 && i.hardware === 0) problems.push(`${i.file.name}: ไม่พบรายการเหล็กหรือน็อตในไฟล์นี้`);
    const created: { id: string; skipped: number }[] = [];
    if (list.length === 0) {
      const empty = await createSteelPlan(name, projectId || null, options);
      if (empty.success) created.push({ id: empty.id, skipped: 0 });
      else problems.push(empty.error);
    }
    for (const g of groups) {
      const result = await createSteelPlanWithParts(g.name, projectId || null, g.parts, options);
      if (!result.success) {
        problems.push(result.error);
        continue;
      }
      created.push({ id: result.id, skipped: g.skipped });
    }

    // The files that are not steel rows go into the (first) new plan.
    if (created.length > 0 && hardwareFiles.length > 0) {
      for (const item of hardwareFiles) {
        const form = new FormData();
        form.set("file", item.file);
        const done = await importHardwarePdf(created[0].id, form);
        if (!done.success) {
          problems.push(`${item.file.name}: ${done.error}`);
          continue;
        }
        const times = timesFor(item, staged.state);
        if (times > 1) await setHardwareFileRounds(created[0].id, item.file.name.slice(0, 200), times);
      }
    }
    if (created.length > 0 && side.length > 0) {
      const times = rememberedTimes();
      for (const file of side) {
        const form = new FormData();
        form.set("file", file);
        form.set("rounds", times);
        const done = await smartImportFile(created[0].id, form);
        if (!done.ok) problems.push(`${file.name}: ${done.error ?? "นำเข้าไม่สำเร็จ"}`);
      }
    }

    if (problems.length === 0) {
      staged.clear();
      setExtras([]);
    }
    if (problems.length > 0) setError(problems.join("\n"));
    if (created.length === 1 && problems.length === 0) {
      router.push(`/steel-cutting/${created[0].id}${created[0].skipped > 0 ? `?skipped=${created[0].skipped}` : ""}`);
      return;
    }
    if (created.length > 0) {
      setNote(
        `สร้าง ${created.length} แผนแล้ว${leftOut > 0 ? ` · ไม่เอา ${leftOut} รายการตามตัวเลือกเหล็กที่เลือก` : ""} (ดูในรายการด้านล่าง)`
      );
    }
    setBusy(false);
    router.refresh();
  };

  const toggleType = (t: SteelType) =>
    setTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-gray-100 bg-white p-4 shadow">
        <p className="mb-2 text-sm font-semibold text-gray-800">ตั้งค่าก่อนโยนไฟล์</p>
        <div className="flex flex-wrap items-end gap-4">
          <label className="block text-xs text-gray-600">
            ระยะตัด / ใบเลื่อย (มม.)
            <input type="number" min={0} step="any" value={kerf} onChange={(e) => setKerf(e.target.value)} className={`${fieldClass} !w-28`} />
          </label>
          <label className="block text-xs text-gray-600">
            ความยาวเหล็กมาตรฐาน
            <div>
              <BarLengthSelect value={barLength} onChange={setBarLength} />
            </div>
          </label>
          <label className="block min-w-[14rem] flex-1 text-xs text-gray-600">
            เอาเฉพาะเหล็กขนาด (เว้นว่าง = ทุกขนาด)
            <input value={sizes} onChange={(e) => setSizes(e.target.value)} placeholder="เช่น 75x75x2.3, 50x50x2.3" className={fieldClass} />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-700">
          <span className="text-gray-500">ชนิดเหล็ก:</span>
          {PICKABLE_TYPES.map((t) => (
            <label key={t} className="inline-flex items-center gap-1">
              <input type="checkbox" checked={types.has(t)} onChange={() => toggleType(t)} />
              {STEEL_TYPES[t].label.replace(/ \(.*\)$/, "")}
            </label>
          ))}
        </div>
        <label className="mt-3 inline-flex items-center gap-1.5 text-xs text-gray-700">
          <input type="checkbox" checked={mergeAll} onChange={(e) => setMergeAll(e.target.checked)} />
          หลายไฟล์ รวมเป็นแผนเดียว (เหล็กชนิดเดียวกันและยาวเท่ากันรวม QTY ให้) · ไม่ติ๊ก = 1 ไฟล์ 1 แผน
        </label>
      </div>

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
            filesFromDrop(e.dataTransfer, () => true).then(addDropped);
          }}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-10 text-center ${
            dragging ? "border-orange-500 bg-orange-50" : "border-gray-300 bg-white hover:border-orange-400"
          } ${busy ? "pointer-events-none opacity-60" : ""}`}
        >
          <FileUp className="mb-2 h-8 w-8 text-orange-500" />
          <span className="text-base font-semibold text-gray-800">ลากไฟล์ใบตัด PDF / CSV / DXF / รูป หรือทั้งโฟลเดอร์มาวางตรงนี้</span>
          <span className="mt-1 text-xs text-gray-500">หรือคลิกเพื่อเลือกไฟล์ · วางเพิ่มทีหลังได้ · ไม่ต้องตั้งชื่อ</span>
          <input
            type="file"
            multiple
            accept="application/pdf,.pdf,.csv,.txt,.tsv,.dxf,.png,.jpg,.jpeg,.webp"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              addDropped(e.target.files);
              e.target.value = "";
            }}
          />
        </label>

        <div className="space-y-2">
          <SteelStagedFiles staged={staged} disabled={busy} />
          {extras.length > 0 && (
            <div className="rounded border border-gray-200 bg-white p-2 text-xs">
              <p className="mb-1 font-semibold text-gray-700">ไฟล์ที่จะส่งเข้าแผน ({extras.length}) — DXF / รูป</p>
              <ul className="max-h-40 space-y-0.5 overflow-y-auto">
                {extras.map((f, i) => (
                  <li key={`${f.name}${i}`} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate" title={f.name}>
                      {f.name}
                    </span>
                    <button type="button" disabled={busy} onClick={() => setExtras((prev) => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-600" aria-label={`เอา ${f.name} ออก`}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(staged.items.length > 0 || extras.length > 0) && (
            <button
              type="button"
              onClick={createFromFiles}
              disabled={busy || staged.reading || (!staged.items.some((i) => i.status === "ready") && extras.length === 0)}
              className="inline-flex w-full items-center justify-center gap-1 rounded bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
            >
              {busy ? "กำลังสร้างแผน…" : staged.reading ? "กำลังอ่านไฟล์…" : `สร้างแผนจาก ${staged.items.filter((i) => i.status === "ready").length + extras.length} ไฟล์`}
            </button>
          )}
        </div>
      </div>

      <form onSubmit={createEmpty} className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-100 bg-white p-4 shadow">
        <label className="block min-w-[12rem] flex-1 text-xs text-gray-500">
          ชื่อแผน (ไม่บังคับ — ถ้าไม่ใส่จะเป็น Untitled (1), (2), …)
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น ฐานเครื่อง Aisin ชุด 1" className={fieldClass} />
        </label>
        <label className="block min-w-[12rem] text-xs text-gray-500">
          โปรเจกต์ (ถ้ามี)
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={fieldClass}>
            <option value="">— ไม่ผูกโปรเจกต์ —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-1 rounded bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          สร้างแผนเปล่า
        </button>
      </form>
      {note && <p className="text-sm text-green-700">{note}</p>}
      {error && <p className="whitespace-pre-line text-sm text-red-600">{error}</p>}
    </div>
  );
}
