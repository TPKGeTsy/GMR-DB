"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Trash2 } from "lucide-react";
import { addDxfPart, deleteSheetPart, updateSheetPart } from "@/app/actions/steelSources";
import type { CutStep, Pt } from "@/lib/dxf";
import { usePrintSection } from "./PrintLayout";

export interface SheetPartRow {
  id: string;
  name: string;
  sourceFile: string;
  width: number;
  height: number;
  thickness: number | null;
  quantity: number;
  features: { kind: string; size: string; center: Pt }[];
  steps: CutStep[];
  geometry: { loops: Pt[][]; bends: [Pt, Pt][] };
}

const inputClass =
  "rounded border border-gray-300 px-1.5 py-0.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";
const fmt = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 1 });

/** The flat pattern with the cutting order written on it (1, 2, 3...). */
function PartDrawing({ part }: { part: SheetPartRow }) {
  const outer = part.geometry.loops[0] ?? [];
  const xs = outer.map((p) => p[0]);
  const ys = outer.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const size = Math.max(maxX - minX, maxY - minY) || 1;
  const pad = size * 0.04;
  const r = size * 0.014; // marker radius
  const toPath = (loop: Pt[]) => loop.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]} ${p[1]}`).join(" ") + " Z";
  return (
    <svg
      viewBox={`${minX - pad} ${-(maxY + pad)} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`}
      className="h-auto max-h-96 w-full"
      role="img"
      aria-label={`รูปคลี่แผ่น ${part.name}`}
    >
      <g transform="scale(1,-1)">
        <path d={toPath(outer)} fill="#fed7aa" stroke="#111" strokeWidth={size * 0.004} />
        {part.geometry.loops.slice(1).map((l, i) => (
          <path key={i} d={toPath(l)} fill="#fff" stroke="#111" strokeWidth={size * 0.003} />
        ))}
        {part.geometry.bends.map(([a, b], i) => (
          <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#dc2626" strokeWidth={size * 0.003} strokeDasharray={`${size * 0.015} ${size * 0.008}`} />
        ))}
      </g>
      {part.steps
        .filter((s) => s.at)
        .map((s) => (
          <g key={s.step} transform={`translate(${s.at![0]} ${-s.at![1]})`}>
            <circle r={r} fill="#1d4ed8" />
            <text textAnchor="middle" dominantBaseline="central" fontSize={r * 1.3} fill="#fff" fontWeight="700">
              {s.step}
            </text>
          </g>
        ))}
    </svg>
  );
}

function PartCard({ part, canEdit }: { part: SheetPartRow; canEdit: boolean }) {
  const router = useRouter();
  const [thickness, setThickness] = useState(part.thickness === null ? "" : String(part.thickness));
  const [quantity, setQuantity] = useState(String(part.quantity));
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    const t = thickness.trim() ? Number(thickness) : null;
    const res = await updateSheetPart(part.id, { thickness: t, quantity: Number(quantity) });
    if (!res.success) setError(res.error ?? "บันทึกไม่สำเร็จ");
    else router.refresh();
  };

  const bendCount = part.geometry.bends.length;
  return (
    <div className="break-inside-avoid rounded border border-gray-200">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{part.name}</h3>
          <p className="text-xs text-gray-500">
            {fmt(part.width)} × {fmt(part.height)} มม. · {part.features.length} ช่อง/รู · {bendCount} เส้นพับ · ไฟล์ {part.sourceFile}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
          <label className="inline-flex items-center gap-1">
            หนา
            <input type="number" min={0} step="any" value={thickness} disabled={!canEdit} onChange={(e) => setThickness(e.target.value)} onBlur={save} className={`${inputClass} w-16`} />
            มม.
          </label>
          <label className="inline-flex items-center gap-1">
            จำนวน
            <input type="number" min={1} step={1} value={quantity} disabled={!canEdit} onChange={(e) => setQuantity(e.target.value)} onBlur={save} className={`${inputClass} w-16`} />
            ชิ้น
          </label>
          {canEdit && (
            <button
              type="button"
              title="ลบ"
              onClick={async () => {
                if (!confirm(`ลบ ${part.name}?`)) return;
                await deleteSheetPart(part.id);
                router.refresh();
              }}
              className="text-gray-400 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          {error && <span className="text-red-600">{error}</span>}
        </div>
      </div>
      <div className="grid gap-4 p-3 sm:grid-cols-2">
        <PartDrawing part={part} />
        <div>
          <p className="mb-1 text-xs font-semibold text-gray-600">ลำดับการตัด / ทำ</p>
          <ol className="space-y-1 text-sm">
            {part.steps.map((s) => (
              <li key={s.step} className="flex gap-2">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-700 text-xs font-bold text-white print:bg-black">
                  {s.step}
                </span>
                <span className={s.kind === "outline" ? "font-semibold" : ""}>{s.label}</span>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-gray-400">ลำดับนี้เป็นข้อเสนอจากตำแหน่งในแบบ: เจาะ/ตัดช่องข้างในก่อน (ไล่จากใกล้มุมซ้ายล่าง) แล้วตัดเส้นรอบนอก แล้วพับ</p>
        </div>
      </div>
    </div>
  );
}

/** DXF flat patterns: drop one or many, get size, holes, bends and the cutting order. */
export default function SteelSheetPanel({ planId, parts, canEdit }: { planId: string; parts: SheetPartRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const print = usePrintSection("dxfParts");

  const handleFiles = async (files: FileList | null | undefined) => {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;
    setBusy(true);
    setProblems([]);
    const failed: string[] = [];
    for (const [i, file] of list.entries()) {
      setProgress(list.length > 1 ? ` ${i + 1}/${list.length}` : "");
      const form = new FormData();
      form.set("file", file);
      const result = await addDxfPart(planId, form);
      if (!result.success) failed.push(result.error);
    }
    setProblems(failed);
    setBusy(false);
    router.refresh();
  };

  return (
    <section style={print.style} className={`rounded-lg border border-gray-100 bg-white p-4 shadow print:border-0 print:p-0 print:shadow-none ${print.className}`}>
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-gray-500 print:hidden">ชิ้นแผ่นเหล็กจากไฟล์ DXF ({parts.length})</h2>
      <p className="mb-3 text-xs text-gray-400 print:hidden">
        โยนไฟล์ .dxf ของรูปคลี่แผ่น (หลายไฟล์พร้อมกันได้) ระบบอ่านขนาด ช่อง/รู เส้นพับ และเสนอลำดับการตัด ชื่อชิ้นและจำนวนอ่านจากชื่อไฟล์ (เช่น _4PCS) ความหนากรอกเอง
      </p>

      {canEdit && (
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
          className={`mb-3 flex cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed px-4 py-6 text-center print:hidden ${
            dragging ? "border-orange-500 bg-orange-50" : "border-gray-300 bg-white hover:border-orange-400"
          } ${busy ? "pointer-events-none opacity-60" : ""}`}
        >
          <FileUp className="mb-1 h-6 w-6 text-orange-500" />
          <span className="text-sm font-semibold text-gray-800">{busy ? `กำลังอ่านไฟล์${progress}…` : "ลากไฟล์ DXF มาวาง (หลายไฟล์ได้) หรือคลิกเพื่อเลือก"}</span>
          <input
            type="file"
            multiple
            accept=".dxf"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      )}

      {problems.length > 0 && <p className="mb-3 whitespace-pre-line text-sm text-red-600">{problems.join("\n")}</p>}

      <div className="space-y-4">
        {parts.map((p) => (
          <PartCard key={p.id} part={p} canEdit={canEdit} />
        ))}
        {parts.length === 0 && <p className="text-sm text-gray-400 print:hidden">ยังไม่มีชิ้นแผ่น</p>}
      </div>
    </section>
  );
}
