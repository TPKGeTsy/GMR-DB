"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUp, Trash2 } from "lucide-react";
import { deleteHardwareRow, readBomImage, saveHardware } from "@/app/actions/steelSources";
import { CATEGORY_LABEL, angleFromRow, classifyBomRow, summarizeFasteners, type BomCategory, type BomRow } from "@/lib/bomImage";

export interface HardwareRow {
  id: string;
  itemNo: number | null;
  partNumber: string;
  description: string;
  quantity: number;
  category: string;
}

const inputClass =
  "w-full rounded border border-gray-300 px-1.5 py-0.5 text-xs focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";
const buttonClass =
  "inline-flex items-center gap-1 rounded bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50";

const KIND_LABEL = { screw: "สกรู", nut: "น็อต", washer: "แหวนรอง" } as const;

/** Picture of a parts list (screws, nuts, washers, angles...) -> checked rows -> saved. */
export default function SteelHardwarePanel({
  planId,
  rows,
  canEdit,
}: {
  planId: string;
  rows: HardwareRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [preview, setPreview] = useState<BomRow[] | null>(null);
  const [sendSteel, setSendSteel] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const readImage = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    setPreview(null);
    const form = new FormData();
    form.set("file", file);
    const result = await readBomImage(form);
    setBusy(false);
    if (!result.success) {
      setMessage(result.error);
      return;
    }
    setPreview(result.rows);
  };

  const confirmSave = async () => {
    if (!preview) return;
    setBusy(true);
    const result = await saveHardware(planId, preview, sendSteel);
    setBusy(false);
    if (!result.success) {
      setMessage(result.error);
      return;
    }
    setMessage(`บันทึก ${result.saved} รายการแล้ว${result.sent > 0 ? ` · ส่งเหล็กฉาก ${result.sent} รายการเข้ารายการตัด` : ""}`);
    setPreview(null);
    router.refresh();
  };

  const savedRows: BomRow[] = rows.map((r) => ({ item: r.itemNo, partNumber: r.partNumber, description: r.description, qty: r.quantity }));
  const totals = summarizeFasteners(savedRows);
  const angleCount = preview ? preview.filter((r) => angleFromRow(r)).length : 0;

  const setCell = (index: number, patch: Partial<BomRow>) =>
    setPreview((prev) => (prev ? prev.map((r, i) => (i === index ? { ...r, ...patch } : r)) : prev));

  return (
    <section className="rounded-lg border border-gray-100 bg-white p-4 shadow print:hidden">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-gray-500">รายการน็อต / สกรู จากรูป ({rows.length})</h2>
      <p className="mb-3 text-xs text-gray-400">โยนรูปตารางรายการ (PNG / JPG) หรือวางรูปที่ก๊อปมา (Ctrl+V) ระบบอ่านเป็นตาราง ตรวจและแก้ได้ก่อนบันทึก</p>

      {canEdit && (
        <label
          tabIndex={0}
          onPaste={(e) => {
            const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
            if (file) {
              e.preventDefault();
              readImage(file);
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
            readImage(e.dataTransfer.files?.[0]);
          }}
          className={`mb-3 flex cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed px-4 py-6 text-center outline-none focus:border-orange-500 ${
            dragging ? "border-orange-500 bg-orange-50" : "border-gray-300 bg-white hover:border-orange-400"
          } ${busy ? "pointer-events-none opacity-60" : ""}`}
        >
          <ImageUp className="mb-1 h-6 w-6 text-orange-500" />
          <span className="text-sm font-semibold text-gray-800">{busy ? "กำลังอ่านรูป… (ประมาณครึ่งนาทีสำหรับตารางยาว)" : "ลากรูปตารางมาวาง · คลิกเลือกไฟล์ · หรือกดที่นี่แล้ววาง (Ctrl+V)"}</span>
          <span className="mt-1 text-xs text-gray-500">รูปไม่เกิน 4 MB ยิ่งชัด ยิ่งอ่านแม่น</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              readImage(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      )}

      {message && <p className="mb-3 text-sm text-gray-700">{message}</p>}

      {preview && (
        <div className="mb-4 space-y-2 rounded border border-orange-200 bg-orange-50 p-3">
          <p className="text-sm font-semibold text-gray-800">
            อ่านได้ {preview.length} แถว — ตรวจกับรูปอีกครั้ง (ตัวเลขและ part number อาจอ่านเพี้ยน แก้ในช่องได้)
          </p>
          <div className="max-h-96 overflow-auto rounded border border-gray-200 bg-white">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-2 py-1 font-medium">#</th>
                  <th className="px-2 py-1 font-medium">PART NUMBER</th>
                  <th className="px-2 py-1 font-medium">DESCRIPTION</th>
                  <th className="px-2 py-1 font-medium">QTY</th>
                  <th className="px-2 py-1 font-medium">ชนิด</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-2 py-1 text-gray-400">{r.item ?? ""}</td>
                    <td className="px-1 py-1">
                      <input value={r.partNumber} onChange={(e) => setCell(i, { partNumber: e.target.value })} className={inputClass} />
                    </td>
                    <td className="px-1 py-1">
                      <input value={r.description} onChange={(e) => setCell(i, { description: e.target.value })} className={inputClass} />
                    </td>
                    <td className="w-20 px-1 py-1">
                      <input
                        type="number"
                        min={1}
                        value={r.qty}
                        onChange={(e) => setCell(i, { qty: Math.round(Number(e.target.value)) })}
                        className={inputClass}
                      />
                    </td>
                    <td className="whitespace-nowrap px-2 py-1 text-gray-600">{CATEGORY_LABEL[classifyBomRow(r)]}</td>
                    <td className="px-1 py-1 text-right">
                      <button
                        type="button"
                        title="เอาแถวนี้ออก"
                        onClick={() => setPreview((prev) => (prev ? prev.filter((_, j) => j !== i) : prev))}
                        className="text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {angleCount > 0 && (
            <label className="flex items-center gap-1.5 text-xs text-gray-700">
              <input type="checkbox" checked={sendSteel} onChange={(e) => setSendSteel(e.target.checked)} />
              ส่งเหล็กฉากที่มีความยาว ({angleCount} รายการ เช่น L 100x100x10 L = 200 mm) เข้ารายการตัดของแผนนี้ด้วย
            </label>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={confirmSave} disabled={busy || preview.length === 0} className={buttonClass}>
              บันทึก {preview.length} รายการ
            </button>
            <button type="button" onClick={() => setPreview(null)} className="text-xs text-gray-500 hover:text-gray-700">
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {totals.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 text-xs font-semibold text-gray-600">สรุปรวมตามขนาด</p>
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
                <tr key={`${t.kind}${t.size}${t.length}`} className="border-t border-gray-100">
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

      {rows.length > 0 && (
        <details className="rounded border border-gray-200 text-sm">
          <summary className="cursor-pointer bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600">ดูรายการทั้งหมด ({rows.length})</summary>
          <table className="w-full text-xs">
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-2 py-1 text-gray-400">{r.itemNo ?? ""}</td>
                  <td className="px-2 py-1">{r.partNumber}</td>
                  <td className="px-2 py-1 text-gray-500">{r.description}</td>
                  <td className="px-2 py-1 text-right font-semibold">{r.quantity.toLocaleString("th-TH")}</td>
                  <td className="px-2 py-1 text-gray-500">{CATEGORY_LABEL[r.category as BomCategory] ?? r.category}</td>
                  <td className="px-2 py-1 text-right">
                    {canEdit && (
                      <button
                        type="button"
                        title="ลบ"
                        onClick={async () => {
                          await deleteHardwareRow(r.id);
                          router.refresh();
                        }}
                        className="text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}
