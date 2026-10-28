"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Plus } from "lucide-react";
import { createSteelPlan, createSteelPlanWithParts, parseSteelPdf } from "@/app/actions/steel";
import { parseBomLines, parsePartsCsv, type SteelPartInput } from "@/lib/steel";

const fieldClass =
  "w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";

/** Start a plan: drop a drawing PDF / CSV straight onto the box (no name needed,
 *  the plan is called "Untitled (n)"), or make an empty plan. */
export default function SteelPlanCreateForm({ projects }: { projects: { id: string; name: string }[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const createEmpty = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await createSteelPlan(name, projectId || null);
    if (!result.success) {
      setError(result.error);
      setBusy(false);
      return;
    }
    router.push(`/steel-cutting/${result.id}`);
  };

  /** Reads one file into pieces to cut; null + message when it cannot be used. */
  const readFile = async (file: File): Promise<{ parts: SteelPartInput[]; skipped: number } | string> => {
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
    return { parts: csv.parts, skipped: csv.errors.length };
  };

  // Each dropped file becomes its own plan (one drawing = one plan).
  const handleFiles = async (files: FileList | null | undefined) => {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;
    setBusy(true);
    setError(null);
    setNote(null);
    const created: { id: string; skipped: number }[] = [];
    const problems: string[] = [];
    for (const file of list) {
      const read = await readFile(file);
      if (typeof read === "string") {
        problems.push(`${file.name}: ${read}`);
        continue;
      }
      if (read.parts.length === 0) {
        problems.push(`${file.name}: ไม่พบรายการที่ใช้ได้ (ต้องมี x, y, z และ QTY)`);
        continue;
      }
      // A typed name only makes sense for a single file.
      const result = await createSteelPlanWithParts(list.length === 1 ? name : "", projectId || null, read.parts);
      if (!result.success) {
        problems.push(`${file.name}: ${result.error}`);
        continue;
      }
      created.push({ id: result.id, skipped: read.skipped });
    }
    if (problems.length > 0) setError(problems.join("\n"));
    if (created.length === 1 && problems.length === 0) {
      router.push(`/steel-cutting/${created[0].id}${created[0].skipped > 0 ? `?skipped=${created[0].skipped}` : ""}`);
      return;
    }
    if (created.length > 0) setNote(`สร้าง ${created.length} แผนแล้ว (ดูในรายการด้านล่าง)`);
    setBusy(false);
    router.refresh();
  };

  return (
    <div className="space-y-3">
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
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-10 text-center ${
          dragging ? "border-orange-500 bg-orange-50" : "border-gray-300 bg-white hover:border-orange-400"
        } ${busy ? "pointer-events-none opacity-60" : ""}`}
      >
        <FileUp className="mb-2 h-8 w-8 text-orange-500" />
        <span className="text-base font-semibold text-gray-800">{busy ? "กำลังอ่านไฟล์…" : "ลากไฟล์ PDF / CSV มาวางตรงนี้ (หลายไฟล์พร้อมกันได้)"}</span>
        <span className="mt-1 text-xs text-gray-500">หรือคลิกเพื่อเลือกไฟล์ · 1 ไฟล์ = 1 แผน ไม่ต้องตั้งชื่อ ระบบสร้างให้ทันที</span>
        <input
          type="file"
          multiple
          accept="application/pdf,.pdf,.csv,.txt,.tsv"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

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
