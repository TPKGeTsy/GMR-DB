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

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    let parts: SteelPartInput[] = [];
    let skipped = 0;
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      const form = new FormData();
      form.set("file", file);
      const read = await parseSteelPdf(form);
      if (!read.success) {
        setError(read.error);
        setBusy(false);
        return;
      }
      parts = read.parts;
      skipped = read.skipped.length;
    } else {
      const text = await file.text();
      const bom = parseBomLines(text.split(/\r?\n/));
      if (bom.parts.length > 0) {
        parts = bom.parts;
        skipped = bom.skipped.length;
      } else {
        const csv = parsePartsCsv(text);
        parts = csv.parts;
        skipped = csv.errors.length;
      }
    }
    if (parts.length === 0) {
      setError("ไม่พบรายการที่ใช้ได้ในไฟล์ (ต้องมี x, y, z และ QTY)");
      setBusy(false);
      return;
    }
    const result = await createSteelPlanWithParts(name, projectId || null, parts);
    if (!result.success) {
      setError(result.error);
      setBusy(false);
      return;
    }
    router.push(`/steel-cutting/${result.id}${skipped > 0 ? `?skipped=${skipped}` : ""}`);
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
          handleFile(e.dataTransfer.files?.[0]);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-10 text-center ${
          dragging ? "border-orange-500 bg-orange-50" : "border-gray-300 bg-white hover:border-orange-400"
        } ${busy ? "pointer-events-none opacity-60" : ""}`}
      >
        <FileUp className="mb-2 h-8 w-8 text-orange-500" />
        <span className="text-base font-semibold text-gray-800">{busy ? "กำลังอ่านไฟล์…" : "ลากไฟล์ PDF / CSV มาวางตรงนี้"}</span>
        <span className="mt-1 text-xs text-gray-500">หรือคลิกเพื่อเลือกไฟล์ · ไม่ต้องตั้งชื่อ ระบบสร้างแผนให้ทันที</span>
        <input
          type="file"
          accept="application/pdf,.pdf,.csv,.txt,.tsv"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
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
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
