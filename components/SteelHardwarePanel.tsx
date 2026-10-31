"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUp, Trash2 } from "lucide-react";
import { addPartsListImage, deleteAllHardware, deleteHardwareFile, importHardwarePdf, deleteHardwareRow, setHardwareFileRounds, deletePartsListImage, updateHardwareRow } from "@/app/actions/steelSources";
import { CATEGORY_LABEL, summarizeFasteners, type BomCategory, type BomRow } from "@/lib/bomImage";
import { usePrintSection } from "./PrintLayout";

export interface HardwareRow {
  id: string;
  itemNo: number | null;
  partNumber: string;
  description: string;
  quantity: number;
  category: string;
  sourceFile: string | null;
  baseQuantity: number | null;
  rounds: number;
}

export interface PartsListImage {
  id: string;
  fileUrl: string;
  fileName: string;
}

const inputClass =
  "w-full rounded border border-gray-300 px-1.5 py-0.5 text-xs focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";

const KIND_LABEL = { screw: "สกรู", nut: "น็อต", washer: "แหวนรอง" } as const;

/** A row saved earlier (read from a picture in an older version), editable: part number, description and QTY. */
function SavedRow({ row, canEdit, onChanged }: { row: HardwareRow; canEdit: boolean; onChanged: () => void }) {
  const [partNumber, setPartNumber] = useState(row.partNumber);
  const [description, setDescription] = useState(row.description);
  const [quantity, setQuantity] = useState(String(row.baseQuantity ?? row.quantity));
  const [rounds, setRounds] = useState(String(row.rounds));
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const qty = Math.round(Number(quantity));
    const times = rounds.trim() === "" ? 1 : Math.round(Number(rounds));
    if (partNumber === row.partNumber && description === row.description && qty === (row.baseQuantity ?? row.quantity) && times === row.rounds) return;
    setError(null);
    const res = await updateHardwareRow(row.id, { partNumber, description, quantity: qty, rounds: times });
    if (!res.success) setError(res.error ?? "บันทึกไม่สำเร็จ");
    else onChanged();
  };

  return (
    <tr className="border-t border-gray-100">
      <td className="px-2 py-1 text-gray-400">{row.itemNo ?? ""}</td>
      <td className="w-full px-1 py-1">
        <input value={partNumber} disabled={!canEdit} onChange={(e) => setPartNumber(e.target.value)} onBlur={save} title={partNumber} className={`${inputClass} print:border-0`} />
      </td>
      {/* Only drawn when the list has a description column with something in it. */}
      {row.description !== "" && (
        <td className="min-w-48 px-1 py-1">
          <input value={description} disabled={!canEdit} onChange={(e) => setDescription(e.target.value)} onBlur={save} title={description} className={`${inputClass} print:border-0`} />
        </td>
      )}
      <td className="w-20 min-w-20 px-1 py-1">
        <input
          type="number"
          min={1}
          aria-label="จำนวนต่อชุด (จากไฟล์)"
          title="จำนวนต่อ 1 ชุด (QTY จากไฟล์)"
          value={quantity}
          disabled={!canEdit}
          onChange={(e) => setQuantity(e.target.value)}
          onBlur={save}
          className={`${inputClass} min-w-16 text-right font-semibold print:border-0`}
        />
      </td>
      <td className="w-20 px-1 py-1">
        <span className="inline-flex items-center gap-1 text-gray-500">
          ×
          <input
            type="number"
            min={0}
            max={1000}
            value={rounds}
            disabled={!canEdit}
            onChange={(e) => setRounds(e.target.value)}
            onBlur={save}
            className={`${inputClass} !w-12 text-right print:border-0`}
            aria-label="จำนวนชุด"
          />
        </span>
      </td>
      <td className="px-2 py-1 text-right font-bold">{row.quantity.toLocaleString("th-TH")}</td>
      <td className="px-2 py-1 text-gray-500">
        {CATEGORY_LABEL[row.category as BomCategory] ?? row.category}
        {error && <span className="ml-1 text-red-600">{error}</span>}
      </td>
      <td className="px-2 py-1 text-right print:hidden">
        {canEdit && (
          <button
            type="button"
            title="ลบแถวนี้"
            onClick={async () => {
              await deleteHardwareRow(row.id);
              onChanged();
            }}
            className="text-gray-400 hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </td>
    </tr>
  );
}

/** The imported parts-list files, each with "whole file x N": every screw, nut and washer of it counts N times. */
function ImportedHardwareFiles({ planId, rows, canEdit, onChanged }: { planId: string; rows: HardwareRow[]; canEdit: boolean; onChanged: () => void }) {
  const files = new Map<string, HardwareRow[]>();
  for (const r of rows) if (r.sourceFile) files.set(r.sourceFile, [...(files.get(r.sourceFile) ?? []), r]);
  if (files.size === 0) return null;
  return (
    <div className="rounded border border-gray-200 print:hidden">
      <p className="border-b border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-600">
        ไฟล์ที่นำเข้า ({files.size}) — แก้จำนวนชุดของทั้งไฟล์ได้เลย ยอดสรุปด้านบนเปลี่ยนทันที
      </p>
      <ul className="divide-y divide-gray-100">
        {[...files.entries()].map(([name, list]) => (
          <HardwareFile key={name} planId={planId} name={name} list={list} canEdit={canEdit} onChanged={onChanged} />
        ))}
      </ul>
    </div>
  );
}

function HardwareFile({ planId, name, list, canEdit, onChanged }: { planId: string; name: string; list: HardwareRow[]; canEdit: boolean; onChanged: () => void }) {
  const same = list.every((r) => r.rounds === list[0].rounds);
  const current = same ? String(list[0].rounds) : "";
  const [text, setText] = useState(current);
  const [lastCurrent, setLastCurrent] = useState(current);
  if (current !== lastCurrent) {
    setLastCurrent(current);
    setText(current);
  }
  const pieces = list.reduce((n, r) => n + r.quantity, 0);

  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
      <span className="min-w-0 flex-1 truncate font-medium text-gray-800" title={name}>
        {name}
      </span>
      <span className="text-xs text-gray-500">
        {list.length} รายการ · {pieces.toLocaleString("th-TH")} ตัว
      </span>
      <span className="inline-flex items-center gap-1 text-gray-600">
        ทั้งไฟล์ ×
        <input
          type="number"
          min={0}
          max={1000}
          step={1}
          value={text}
          placeholder={same ? undefined : "หลายค่า"}
          disabled={!canEdit}
          onChange={async (e) => {
            setText(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value.trim() === "" || !Number.isInteger(n) || n < 0 || n > 1000) return;
            await setHardwareFileRounds(planId, name, n);
            onChanged();
          }}
          className={`${inputClass} !w-16`}
          aria-label={`จำนวนชุดของ ${name}`}
        />
      </span>
      {canEdit && (
        <button
          type="button"
          title="ลบรายการทั้งหมดของไฟล์นี้"
          onClick={async () => {
            if (!confirm(`ลบรายการทั้งหมดที่มาจาก ${name} (${list.length} รายการ)?`)) return;
            await deleteHardwareFile(planId, name);
            onChanged();
          }}
          className="text-gray-400 hover:text-red-600"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}

/** Pictures of the screw / nut / washer list: dropped or pasted in, turned into a clean scan-like
 *  page, and printed with the plan. (Rows saved by an older version are still listed below.) */
export default function SteelHardwarePanel({
  planId,
  images,
  rows,
  canEdit,
}: {
  planId: string;
  images: PartsListImage[];
  rows: HardwareRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const print = usePrintSection("hardware");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const upload = async (files: FileList | File[] | null | undefined) => {
    const list = Array.from(files ?? []).filter((f) => f.type.startsWith("image/") || /\.pdf$/i.test(f.name) || f.type === "application/pdf");
    if (list.length === 0) {
      setMessage("เลือกไฟล์ PDF ของตารางรายการ หรือรูป (PNG, JPG, WEBP)");
      return;
    }
    setBusy(true);
    setMessage(null);
    const problems: string[] = [];
    for (const file of list) {
      const form = new FormData();
      form.set("file", file);
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      const result = isPdf ? await importHardwarePdf(planId, form) : await addPartsListImage(planId, form);
      if (!result.success) problems.push(`${file.name}: ${result.error}`);
    }
    setBusy(false);
    if (problems.length > 0) setMessage(problems.join(" · "));
    router.refresh();
  };

  const savedRows: BomRow[] = rows.map((r) => ({ item: r.itemNo, partNumber: r.partNumber, description: r.description, qty: r.quantity }));
  const totals = summarizeFasteners(savedRows, false);

  if (images.length === 0 && rows.length === 0 && !canEdit) return null;

  return (
    <section id="sec-hardware" style={print.style} className={`scroll-mt-36 rounded-lg border border-gray-100 bg-white p-4 shadow print:border-0 print:p-0 print:shadow-none ${print.className}`}>
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-gray-500">รายการน็อต / สกรู ({rows.length} รายการ · {images.length} รูป)</h2>
      <p className="mb-3 text-xs text-gray-400 print:hidden">
        โยนไฟล์ PDF ของตารางรายการ (ITEM NO. / PART NUMBER / QTY.) ระบบอ่านเฉพาะสกรู (screw / bolt) น็อตตัวเมีย (nut) และแหวน (washer) เรียงตามต้นฉบับ แล้วสรุปยอดของที่เหมือนกันเป๊ะไว้ด้านบน · ถ้าเป็นรูปภาพ (PNG / JPG หรือวางด้วย Ctrl+V) ระบบเก็บรูปไว้พิมพ์ต่อท้ายใบงานอย่างเดียว ไม่ได้อ่านข้อความ
      </p>

      {canEdit && (
        <label
          tabIndex={0}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
            if (files.length > 0) {
              e.preventDefault();
              upload(files);
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            upload(e.dataTransfer.files);
          }}
          className={`mb-3 flex cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed px-4 py-6 text-center outline-none focus:border-orange-500 print:hidden ${
            dragging ? "border-orange-500 bg-orange-50" : "border-gray-300 bg-white hover:border-orange-400"
          } ${busy ? "pointer-events-none opacity-60" : ""}`}
        >
          <ImageUp className="mb-1 h-6 w-6 text-orange-500" />
          <span className="text-sm font-semibold text-gray-800">{busy ? "กำลังบันทึกรูป…" : "ลากไฟล์ PDF / รูปตารางมาวาง · คลิกเลือกไฟล์ · หรือกดที่นี่แล้ววาง (Ctrl+V)"}</span>
          <span className="mt-1 text-xs text-gray-500">PDF ไม่เกิน 5 MB (ต้องมีตัวหนังสือ ไม่ใช่ภาพสแกน) · รูปไม่เกิน 8 MB · วางได้หลายไฟล์</span>
          <input
            type="file"
            multiple
            accept="application/pdf,.pdf,image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              upload(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      )}

      {message && <p className="mb-3 text-sm text-red-600 print:hidden">{message}</p>}

      {totals.length > 0 && (
        <div className="mb-4 break-inside-avoid rounded border-2 border-black p-3">
          <p className="mb-1 text-sm font-bold text-gray-900">สรุปยอดรวม — ของที่เหมือนกันเป๊ะ (ชนิด ขนาด ความยาวเดียวกัน)</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                <th className="py-1 font-medium">ชนิด</th>
                <th className="py-1 font-medium">ขนาด</th>
                <th className="py-1 text-right font-medium">ยาว (มม.)</th>
                <th className="py-1 text-right font-medium">รวม (ตัว)</th>
              </tr>
            </thead>
            <tbody>
              {totals.map((t) => (
                <tr key={`${t.kind}${t.size}${t.length}`} className="border-t border-gray-200">
                  <td className="py-1">{KIND_LABEL[t.kind]}</td>
                  <td className="py-1 font-medium">{t.size}</td>
                  <td className="py-1 text-right">{t.length ?? "—"}</td>
                  <td className="py-1 text-right font-bold">{t.quantity.toLocaleString("th-TH")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}


      {images.length > 0 && (
        <div className="space-y-3">
          {images.map((image) => (
            <figure key={image.id} className="break-inside-avoid">
              <div className="mb-1 flex items-center justify-between text-xs text-gray-500 print:hidden">
                <span className="truncate" title={image.fileName}>
                  {image.fileName}
                </span>
                {canEdit && (
                  <button
                    type="button"
                    title="ลบรูปนี้"
                    onClick={async () => {
                      if (!confirm("ลบรูปนี้?")) return;
                      await deletePartsListImage(image.id);
                      router.refresh();
                    }}
                    className="inline-flex items-center gap-1 text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    ลบ
                  </button>
                )}
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.fileUrl} alt={`รายการน็อต/สกรู ${image.fileName}`} className="h-auto w-full border border-gray-300 bg-white" />
            </figure>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-4 space-y-3">
          <ImportedHardwareFiles planId={planId} rows={rows} canEdit={canEdit} onChanged={() => router.refresh()} />
          <div className="rounded border border-gray-200 text-sm">
            <div className="flex items-center justify-between bg-gray-50 px-3 py-1.5">
              <span className="text-xs font-medium text-gray-600">รายการตามต้นฉบับ ({rows.length})</span>
              {canEdit && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm(`ลบรายการตามต้นฉบับทั้งหมด ${rows.length} แถว?`)) return;
                    await deleteAllHardware(planId);
                    router.refresh();
                  }}
                  className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 print:hidden"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  ลบทั้งหมด
                </button>
              )}
            </div>
            <table className="block w-full overflow-x-auto text-xs sm:table sm:overflow-visible">
              <tbody>
                {rows.map((r) => (
                  <SavedRow key={`${r.id}-${r.partNumber}-${r.description}-${r.quantity}`} row={r} canEdit={canEdit} onChanged={() => router.refresh()} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
