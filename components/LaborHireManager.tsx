"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { HardHat, Wrench, Users, Wallet, Plus, Pencil, Trash2, X, User, FolderKanban } from "lucide-react";
import {
  createLaborHire,
  updateLaborHire,
  deleteLaborHire,
  type LaborHireRow,
  type LaborHireOptions,
} from "@/app/actions/laborHire";
import { summarizeLaborHires } from "@/lib/laborHire";
import { formatThaiDateLong } from "@/lib/datetime";

const inputClass =
  "mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white outline-none transition-colors";

const baht = (n: number) => `฿${n.toLocaleString("th-TH")}`;

function SummaryTile({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  return (
    <div className="bg-white shadow-sm rounded-3xl border border-gray-100 p-4">
      <div className={`flex items-center justify-center w-10 h-10 rounded-2xl mb-2 ${tone}`}>{icon}</div>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="text-lg font-bold text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}

function LaborHireModal({
  options,
  editing,
  defaultDateKey,
  onClose,
  onSaved,
}: {
  options: LaborHireOptions;
  editing: LaborHireRow | null;
  defaultDateKey: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [dateKey, setDateKey] = useState(editing?.dateKey ?? defaultDateKey);
  const [title, setTitle] = useState(editing?.title ?? "");
  const [projectId, setProjectId] = useState(editing?.projectId ?? "");
  const [responsibleId, setResponsibleId] = useState(editing?.responsibleId ?? options.users[0]?.id ?? "");
  const [technicianCount, setTechnicianCount] = useState(editing ? String(editing.technicianCount) : "");
  const [laborerCount, setLaborerCount] = useState(editing ? String(editing.laborerCount) : "");
  const [cost, setCost] = useState(editing ? String(editing.cost) : "");
  const [note, setNote] = useState(editing?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      dateKey,
      title,
      projectId: projectId || null,
      responsibleId,
      // Blank means none, so only the number that applies has to be typed.
      technicianCount: technicianCount === "" ? 0 : Number(technicianCount),
      laborerCount: laborerCount === "" ? 0 : Number(laborerCount),
      cost: cost === "" ? 0 : Number(cost),
      note,
    };
    const result = editing ? await updateLaborHire(editing.id, payload) : await createLaborHire(payload);

    if (!result.success) {
      setError(result.error || "บันทึกไม่สำเร็จ");
      setSaving(false);
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-xl w-full max-w-md p-5 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="mx-auto sm:hidden w-10 h-1 rounded-full bg-gray-200 -mt-1 mb-1" />
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900">{editing ? "แก้ไขรายการจ้าง" : "เพิ่มรายการจ้างช่าง/คนงานนอก"}</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="text-xs text-gray-400">วันที่</label>
            <input type="date" value={dateKey} onChange={(e) => setDateKey(e.target.value)} required className={inputClass} />
          </div>

          <div>
            <label className="text-xs text-gray-400">หัวข้องาน</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="เช่น ติดตั้งตู้คอนโทรล Sharp"
              maxLength={120}
              required
              className={inputClass}
            />
          </div>

          <div>
            <label className="text-xs text-gray-400">โปรเจกต์ (ไม่บังคับ)</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={inputClass}>
              <option value="">— ไม่ผูกโปรเจกต์ —</option>
              {options.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-400">ผู้รับผิดชอบการจ้าง</label>
            <select value={responsibleId} onChange={(e) => setResponsibleId(e.target.value)} required className={inputClass}>
              {options.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400">ช่าง (คน)</label>
              <input
                type="number"
                min={0}
                max={999}
                step={1}
                inputMode="numeric"
                value={technicianCount}
                onChange={(e) => setTechnicianCount(e.target.value)}
                placeholder="0"
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400">คนงาน (คน)</label>
              <input
                type="number"
                min={0}
                max={999}
                step={1}
                inputMode="numeric"
                value={laborerCount}
                onChange={(e) => setLaborerCount(e.target.value)}
                placeholder="0"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400">ค่าใช้จ่ายในการจ้าง (บาท รวมทั้งงาน)</label>
            <input
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="0"
              className={inputClass}
            />
          </div>

          <div>
            <label className="text-xs text-gray-400">หมายเหตุ</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="เช่น จ้างรายวัน วันละ 600 บาท/คน, ชื่อหัวหน้าช่าง"
              className={`${inputClass} resize-none`}
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2.5 rounded-full border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50 transition-colors"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-full bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 active:bg-orange-800 shadow-sm shadow-orange-200 disabled:opacity-50 disabled:shadow-none transition-colors"
            >
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LaborHireManager({
  rows,
  options,
  defaultDateKey,
}: {
  rows: LaborHireRow[];
  options: LaborHireOptions;
  defaultDateKey: string;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editing, setEditing] = useState<LaborHireRow | null>(null);

  const totals = summarizeLaborHires(rows);

  const handleDelete = async (row: LaborHireRow) => {
    if (!confirm(`ลบรายการ "${row.title}" (${row.dateKey}) ถาวร?`)) return;
    const result = await deleteLaborHire(row.id);
    if (!result.success) {
      alert(result.error || "ลบไม่สำเร็จ");
      return;
    }
    router.refresh();
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryTile icon={<Wrench className="w-5 h-5 text-orange-600" />} tone="bg-orange-50" label="ช่างที่จ้าง" value={`${totals.technicians} คน`} />
        <SummaryTile icon={<Users className="w-5 h-5 text-blue-600" />} tone="bg-blue-50" label="คนงานที่จ้าง" value={`${totals.laborers} คน`} />
        <SummaryTile icon={<HardHat className="w-5 h-5 text-purple-600" />} tone="bg-purple-50" label="จำนวนงาน" value={`${totals.records} งาน`} />
        <SummaryTile icon={<Wallet className="w-5 h-5 text-green-600" />} tone="bg-green-50" label="ค่าใช้จ่ายรวม" value={baht(totals.cost)} />
      </div>

      <div className="bg-white shadow-sm rounded-3xl border border-gray-100 p-4 sm:p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-900">รายการจ้างในช่วงที่เลือก ({rows.length})</h2>
          <button
            onClick={() => {
              setEditing(null);
              setModal("add");
            }}
            className="inline-flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 font-semibold bg-orange-50 hover:bg-orange-100 rounded-full px-3 py-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            เพิ่มรายการ
          </button>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10 bg-gray-50 rounded-2xl">ยังไม่มีรายการจ้างในช่วงนี้</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.id} className="rounded-2xl border border-gray-100 bg-white p-3">
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center">
                    <HardHat className="w-[18px] h-[18px] text-orange-600" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 break-words">{row.title}</p>
                        <p className="text-[11px] text-gray-400">{formatThaiDateLong(row.dateKey)}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => {
                            setEditing(row);
                            setModal("edit");
                          }}
                          title="แก้ไข"
                          className="flex items-center justify-center w-7 h-7 rounded-full text-gray-400 hover:text-orange-600 hover:bg-orange-50 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(row)}
                          title="ลบ"
                          className="flex items-center justify-center w-7 h-7 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {row.technicianCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full">
                          <Wrench className="w-3 h-3" />
                          ช่าง {row.technicianCount} คน
                        </span>
                      )}
                      {row.laborerCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                          <Users className="w-3 h-3" />
                          คนงาน {row.laborerCount} คน
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                        <Wallet className="w-3 h-3" />
                        {baht(row.cost)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-2 text-xs text-gray-500">
                      <span className="inline-flex items-center gap-1">
                        <User className="w-3 h-3 text-gray-400" />
                        ผู้รับผิดชอบ: <span className="font-medium text-gray-700">{row.responsibleName}</span>
                      </span>
                      {row.projectName && row.projectId && (
                        <Link href={`/projects/${row.projectId}`} className="inline-flex items-center gap-1 hover:text-orange-600">
                          <FolderKanban className="w-3 h-3 text-gray-400" />
                          {row.projectName}
                        </Link>
                      )}
                    </div>
                    {row.note && <p className="text-xs text-gray-400 italic mt-1.5">{row.note}</p>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {modal && (
        <LaborHireModal
          options={options}
          editing={modal === "edit" ? editing : null}
          defaultDateKey={defaultDateKey}
          onClose={() => {
            setModal(null);
            setEditing(null);
          }}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}
