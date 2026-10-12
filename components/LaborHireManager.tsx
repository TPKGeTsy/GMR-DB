"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  HardHat, Wrench, Users, Wallet, Plus, Pencil, Trash2, X, User, FolderKanban, Building2, Phone, MapPin, FileText,
  BadgeCheck, Clock, CalendarDays,
} from "lucide-react";
import {
  createLaborHire,
  updateLaborHire,
  deleteLaborHire,
  type LaborHireRow,
  type LaborHireOptions,
  type VendorSuggestion,
} from "@/app/actions/laborHire";
import {
  summarizeLaborHires,
  computeLaborCost,
  paymentStatusOf,
  hireTypeLabel,
  contractTypeLabel,
  contractLabel,
  workerRoleLabel,
  normalizeName,
  HIRE_TYPES,
  CONTRACT_TYPES,
  WORKER_ROLES,
  type HireType,
  type ContractType,
  type RateMode,
  type WorkerRole,
} from "@/lib/laborHire";
import { formatThaiDateLong } from "@/lib/datetime";
import NameSuggest from "./NameSuggest";
import LaborPaymentBadge from "./LaborPaymentBadge";

const inputClass =
  "mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white outline-none transition-colors";

const baht = (n: number) => `฿${n.toLocaleString("th-TH")}`;

const hireTypeBadge: Record<HireType, string> = {
  COMPANY: "bg-blue-50 text-blue-700",
  INDIVIDUAL: "bg-purple-50 text-purple-700",
  MIXED: "bg-gray-100 text-gray-600",
};

function SummaryTile({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  return (
    <div className="bg-white shadow-sm rounded-3xl border border-gray-100 p-4">
      <div className={`flex items-center justify-center w-10 h-10 rounded-2xl mb-2 ${tone}`}>{icon}</div>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="text-lg font-bold text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex gap-1 rounded-full bg-gray-100 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-full py-1.5 text-xs font-semibold transition-colors ${
            value === o.value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const num = (v: string) => (v.trim() === "" ? 0 : Number(v));
const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

interface WorkerDraft {
  key: string;
  name: string;
  role: WorkerRole;
  rate: string;
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
  const seq = useRef(0);
  const newKey = () => `w${++seq.current}`;

  const [f, setF] = useState({
    dateKey: editing?.dateKey ?? defaultDateKey,
    title: editing?.title ?? "",
    projectId: editing?.projectId ?? "",
    responsibleId: editing?.responsibleId ?? options.users[0]?.id ?? "",
    hireType: (editing?.hireType ?? "COMPANY") as HireType,
    vendorName: editing?.vendorName ?? "",
    vendorPhone: editing?.vendorPhone ?? "",
    technicianCount: editing ? String(editing.technicianCount) : "",
    laborerCount: editing ? String(editing.laborerCount) : "",
    contractType: (editing?.contractType ?? "FIXED_TERM") as ContractType,
    days: editing ? String(editing.days) : "1",
    rateMode: (editing?.rateMode ?? "LUMP_SUM") as RateMode,
    cost: editing ? String(editing.cost) : "",
    technicianRate: editing?.technicianRate != null ? String(editing.technicianRate) : "",
    laborerRate: editing?.laborerRate != null ? String(editing.laborerRate) : "",
    paidAmount: editing && editing.paidAmount > 0 ? String(editing.paidAmount) : "",
    paidDateKey: editing?.paidDateKey ?? "",
    trade: editing?.trade ?? "",
    location: editing?.location ?? "",
    reference: editing?.reference ?? "",
    note: editing?.note ?? "",
  });
  const [workers, setWorkers] = useState<WorkerDraft[]>(
    () =>
      editing?.workers.map((w, i) => ({
        key: `e${i}`,
        name: w.name,
        role: w.role,
        rate: w.dailyRate != null ? String(w.dailyRate) : "",
      })) ?? []
  );
  const set = <K extends keyof typeof f>(key: K) => (value: (typeof f)[K]) => setF((prev) => ({ ...prev, [key]: value }));
  const onText = (key: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((prev) => ({ ...prev, [key]: e.target.value }));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const named = workers.filter((w) => w.name.trim() !== "");
  const namedTech = named.filter((w) => w.role === "TECHNICIAN").length;
  const namedLabor = named.filter((w) => w.role === "LABORER").length;
  // Naming someone implies they were hired, so the headcount can't be lower
  // than the people listed.
  const techCount = Math.max(num(f.technicianCount), namedTech);
  const laborCount = Math.max(num(f.laborerCount), namedLabor);
  const bumped = techCount > num(f.technicianCount) || laborCount > num(f.laborerCount);
  const workersInput = named.map((w) => ({ name: w.name, role: w.role, dailyRate: numOrNull(w.rate) }));

  const days = f.days.trim() === "" ? 1 : Number(f.days);
  const effectiveCost = computeLaborCost({
    rateMode: f.rateMode,
    cost: num(f.cost),
    days,
    technicianCount: techCount,
    laborerCount: laborCount,
    technicianRate: numOrNull(f.technicianRate),
    laborerRate: numOrNull(f.laborerRate),
    workers: workersInput,
  });
  const status = paymentStatusOf(effectiveCost, num(f.paidAmount));
  const hasExtras = !!(f.trade || f.location || f.reference || f.note);

  const addWorker = (prefill: Partial<WorkerDraft> = {}) => {
    setWorkers((prev) => [...prev, { key: newKey(), name: "", role: "LABORER", rate: "", ...prefill }]);
  };
  const patchWorker = (key: string, patch: Partial<WorkerDraft>) =>
    setWorkers((prev) => prev.map((w) => (w.key === key ? { ...w, ...patch } : w)));
  const removeWorker = (key: string) => setWorkers((prev) => prev.filter((w) => w.key !== key));

  const fillWorkerFrom = (key: string, s: VendorSuggestion) =>
    patchWorker(key, {
      name: s.name,
      // What we agreed with them last time is the best starting point.
      ...(s.lastRole ? { role: s.lastRole } : {}),
      ...(s.lastRate !== null ? { rate: String(s.lastRate) } : {}),
    });

  /** Picking from the contractor field: a company fills the vendor; a person
   *  is added to the worker list (the contractor field is for companies). */
  const pickFromVendorField = (s: VendorSuggestion) => {
    if (s.kind === "COMPANY") {
      setF((prev) => ({
        ...prev,
        vendorName: s.name,
        vendorPhone: prev.vendorPhone || s.phone || "",
        hireType: prev.hireType === "INDIVIDUAL" ? "MIXED" : "COMPANY",
      }));
      return;
    }
    setF((prev) => ({ ...prev, vendorName: "", hireType: prev.hireType === "COMPANY" ? "INDIVIDUAL" : prev.hireType }));
    setWorkers((prev) =>
      prev.some((w) => normalizeName(w.name) === s.key)
        ? prev
        : [
            ...prev,
            {
              key: newKey(),
              name: s.name,
              role: s.lastRole ?? "LABORER",
              rate: s.lastRate !== null ? String(s.lastRate) : "",
            },
          ]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      dateKey: f.dateKey,
      title: f.title,
      projectId: f.projectId || null,
      responsibleId: f.responsibleId,
      technicianCount: techCount,
      laborerCount: laborCount,
      cost: num(f.cost),
      note: f.note,
      hireType: f.hireType,
      vendorName: f.vendorName,
      vendorPhone: f.vendorPhone,
      trade: f.trade,
      location: f.location,
      reference: f.reference,
      contractType: f.contractType,
      days,
      rateMode: f.rateMode,
      technicianRate: numOrNull(f.technicianRate),
      laborerRate: numOrNull(f.laborerRate),
      paidAmount: num(f.paidAmount),
      paidDateKey: f.paidDateKey || null,
      workers: workersInput,
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
            <label className="text-xs text-gray-400">วันที่ (วันเริ่มงาน)</label>
            <input type="date" value={f.dateKey} onChange={onText("dateKey")} required className={inputClass} />
          </div>

          <div>
            <label className="text-xs text-gray-400">หัวข้องาน</label>
            <input
              type="text"
              value={f.title}
              onChange={onText("title")}
              placeholder="เช่น ติดตั้งตู้คอนโทรล Sharp"
              maxLength={120}
              required
              className={inputClass}
            />
          </div>

          <div>
            <label className="text-xs text-gray-400">โปรเจกต์ (ไม่บังคับ)</label>
            <select value={f.projectId} onChange={onText("projectId")} className={inputClass}>
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
            <select value={f.responsibleId} onChange={onText("responsibleId")} required className={inputClass}>
              {options.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-2xl border border-gray-100 p-3 space-y-3">
            <div>
              <p className="text-xs text-gray-400 mb-1">รูปแบบการจ้าง</p>
              <Segmented
                value={f.hireType}
                onChange={set("hireType")}
                options={HIRE_TYPES.map((t) => ({ value: t, label: hireTypeLabel[t] }))}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400">
                {f.hireType === "INDIVIDUAL" ? "หัวหน้าช่าง/ผู้ประสานงาน (ถ้ามี)" : "ชื่อบริษัท/ผู้รับเหมา"} — พิมพ์เพื่อค้นหาที่เคยจ้าง
              </label>
              <div className="mt-1">
                <NameSuggest
                  value={f.vendorName}
                  onChange={set("vendorName")}
                  onPick={pickFromVendorField}
                  maxLength={120}
                  placeholder="พิมพ์ชื่อ แล้วเลือกจากรายการที่เคยจ้าง"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white outline-none transition-colors"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400">เบอร์โทร</label>
              <input type="tel" value={f.vendorPhone} onChange={onText("vendorPhone")} maxLength={30} className={inputClass} />
            </div>
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
                value={f.technicianCount}
                onChange={onText("technicianCount")}
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
                value={f.laborerCount}
                onChange={onText("laborerCount")}
                placeholder="0"
                className={inputClass}
              />
            </div>
          </div>
          {bumped && (
            <p className="text-[11px] text-gray-400">
              จำนวนคนปรับให้ไม่น้อยกว่ารายชื่อที่ระบุ (ช่าง {techCount} / คนงาน {laborCount})
            </p>
          )}

          <div className="rounded-2xl border border-gray-100 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">รายชื่อ + ค่าแรงที่ตกลง (ไม่บังคับ)</p>
              <button
                type="button"
                onClick={() => addWorker()}
                className="inline-flex items-center gap-1 text-[11px] text-orange-600 hover:text-orange-700 font-semibold bg-orange-50 hover:bg-orange-100 rounded-full px-2.5 py-1 transition-colors"
              >
                <Plus className="w-3 h-3" />
                เพิ่มรายชื่อ
              </button>
            </div>
            {workers.length === 0 && (
              <p className="text-[11px] text-gray-400">
                ใส่ชื่อรายคนพร้อมค่าแรงต่อวันที่ตกลงกันไว้ จะไปแสดงในประวัติการจ้างของคนนั้นด้วย
              </p>
            )}
            {workers.map((w) => (
              <div key={w.key} className="rounded-xl bg-gray-50 p-2 space-y-2">
                <NameSuggest
                  value={w.name}
                  onChange={(text) => patchWorker(w.key, { name: text })}
                  onPick={(s) => fillWorkerFrom(w.key, s)}
                  kinds={["PERSON"]}
                  maxLength={80}
                  placeholder="ชื่อ (พิมพ์เพื่อค้นหาคนที่เคยจ้าง)"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
                />
                <div className="flex items-center gap-2">
                  <select
                    value={w.role}
                    onChange={(e) => patchWorker(w.key, { role: e.target.value as WorkerRole })}
                    className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
                  >
                    {WORKER_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {workerRoleLabel[r]}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={w.rate}
                    onChange={(e) => patchWorker(w.key, { rate: e.target.value })}
                    placeholder="ค่าแรง ฿/วัน"
                    className="flex-1 min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => removeWorker(w.key)}
                    title="เอาออก"
                    className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-gray-100 p-3 space-y-3">
            <div>
              <p className="text-xs text-gray-400 mb-1">ระยะเวลาจ้าง</p>
              <Segmented
                value={f.contractType}
                onChange={set("contractType")}
                options={CONTRACT_TYPES.map((t) => ({ value: t, label: contractTypeLabel[t] }))}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400">
                {f.contractType === "FIXED_TERM" ? "สัญญากี่วัน" : "จ้างมาแล้วกี่วัน (แก้เพิ่มได้เมื่อจ้างต่อ)"}
              </label>
              <input
                type="number"
                min={1}
                max={365}
                step={1}
                inputMode="numeric"
                value={f.days}
                onChange={onText("days")}
                className={inputClass}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 p-3 space-y-3">
            <div>
              <p className="text-xs text-gray-400 mb-1">วิธีคิดค่าใช้จ่าย</p>
              <Segmented
                value={f.rateMode}
                onChange={set("rateMode")}
                options={[
                  { value: "LUMP_SUM", label: "ยอดรวมทั้งงาน" },
                  { value: "DAILY_RATE", label: "คิดรายวันต่อคน" },
                ]}
              />
            </div>

            {f.rateMode === "LUMP_SUM" ? (
              <div>
                <label className="text-xs text-gray-400">ค่าใช้จ่ายในการจ้าง (บาท รวมทั้งงาน)</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={f.cost}
                  onChange={onText("cost")}
                  placeholder="0"
                  className={inputClass}
                />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400">ช่าง ฿/วัน (อัตรากลาง)</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      value={f.technicianRate}
                      onChange={onText("technicianRate")}
                      placeholder="0"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">คนงาน ฿/วัน (อัตรากลาง)</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      value={f.laborerRate}
                      onChange={onText("laborerRate")}
                      placeholder="0"
                      className={inputClass}
                    />
                  </div>
                </div>
                <p className="text-[11px] text-gray-400">
                  คนที่ระบุค่าแรงรายคนไว้ในรายชื่อ จะคิดตามค่าแรงของเขา คนที่เหลือคิดตามอัตรากลาง คูณจำนวนวัน
                </p>
              </>
            )}

            <p className="text-sm font-semibold text-gray-900">
              ค่าใช้จ่ายรวม <span className="text-green-700">{baht(effectiveCost)}</span>
              {f.rateMode === "DAILY_RATE" && <span className="text-[11px] font-normal text-gray-400"> (คำนวณให้อัตโนมัติ)</span>}
            </p>
          </div>

          <div className="rounded-2xl border border-gray-100 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">การจ่ายเงิน</p>
              {status !== "NONE" && (
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    status === "PAID"
                      ? "bg-green-50 text-green-700"
                      : status === "PARTIAL"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-red-50 text-red-700"
                  }`}
                >
                  {status === "PAID" ? "จ่ายครบแล้ว" : status === "PARTIAL" ? "จ่ายบางส่วน" : "ยังไม่จ่าย"}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400">จ่ายแล้ว (บาท)</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={f.paidAmount}
                  onChange={onText("paidAmount")}
                  placeholder="0"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400">วันที่จ่าย</label>
                <input type="date" value={f.paidDateKey} onChange={onText("paidDateKey")} className={inputClass} />
              </div>
            </div>
          </div>

          <details open={hasExtras} className="rounded-2xl border border-gray-100 p-3">
            <summary className="text-xs font-semibold text-gray-500 cursor-pointer">รายละเอียดเพิ่มเติม (ไม่บังคับ)</summary>
            <div className="space-y-3 mt-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400">ประเภทช่าง/งาน</label>
                  <input type="text" value={f.trade} onChange={onText("trade")} maxLength={60} placeholder="เช่น ช่างไฟ" className={inputClass} />
                </div>
                <div>
                  <label className="text-xs text-gray-400">สถานที่</label>
                  <input type="text" value={f.location} onChange={onText("location")} maxLength={120} className={inputClass} />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400">เลขที่อ้างอิง (ใบเสนอราคา/ใบเสร็จ)</label>
                <input type="text" value={f.reference} onChange={onText("reference")} maxLength={60} className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-gray-400">หมายเหตุ</label>
                <textarea value={f.note} onChange={onText("note")} rows={2} maxLength={500} className={`${inputClass} resize-none`} />
              </div>
            </div>
          </details>

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

const WORKERS_SHOWN = 5;

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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <SummaryTile icon={<Wrench className="w-5 h-5 text-orange-600" />} tone="bg-orange-50" label="ช่างที่จ้าง" value={`${totals.technicians} คน`} />
        <SummaryTile icon={<Users className="w-5 h-5 text-blue-600" />} tone="bg-blue-50" label="คนงานที่จ้าง" value={`${totals.laborers} คน`} />
        <SummaryTile icon={<HardHat className="w-5 h-5 text-purple-600" />} tone="bg-purple-50" label="จำนวนงาน" value={`${totals.records} งาน`} />
        <SummaryTile icon={<Wallet className="w-5 h-5 text-green-600" />} tone="bg-green-50" label="ค่าใช้จ่ายรวม" value={baht(totals.cost)} />
        <SummaryTile icon={<BadgeCheck className="w-5 h-5 text-emerald-600" />} tone="bg-emerald-50" label="จ่ายแล้ว" value={baht(totals.paid)} />
        <SummaryTile icon={<Clock className="w-5 h-5 text-red-600" />} tone="bg-red-50" label="ค้างจ่าย" value={baht(totals.outstanding)} />
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
                      <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full ${hireTypeBadge[row.hireType]}`}>
                        {hireTypeLabel[row.hireType]}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
                        <CalendarDays className="w-3 h-3" />
                        {contractLabel(row.contractType, row.days)}
                      </span>
                      {row.technicianCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full">
                          <Wrench className="w-3 h-3" />
                          ช่าง {row.technicianCount} คน
                          {row.trade ? ` (${row.trade})` : ""}
                        </span>
                      )}
                      {row.laborerCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                          <Users className="w-3 h-3" />
                          คนงาน {row.laborerCount} คน
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full">
                        <Wallet className="w-3 h-3" />
                        {baht(row.cost)}
                      </span>
                      <LaborPaymentBadge cost={row.cost} paidAmount={row.paidAmount} />
                    </div>

                    {row.rateMode === "DAILY_RATE" && (
                      <p className="text-[11px] text-gray-400 mt-1">
                        คิดรายวัน
                        {row.technicianCount > 0 && row.technicianRate != null && ` · ช่าง ${baht(row.technicianRate)}/วัน`}
                        {row.laborerCount > 0 && row.laborerRate != null && ` · คนงาน ${baht(row.laborerRate)}/วัน`}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-2 text-xs text-gray-500">
                      <span className="inline-flex items-center gap-1">
                        <User className="w-3 h-3 text-gray-400" />
                        ผู้รับผิดชอบ: <span className="font-medium text-gray-700">{row.responsibleName}</span>
                      </span>
                      {row.vendorName && (
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-gray-400" />
                          {row.vendorName}
                        </span>
                      )}
                      {row.vendorPhone && (
                        <a href={`tel:${row.vendorPhone.replace(/\s+/g, "")}`} className="inline-flex items-center gap-1 hover:text-orange-600">
                          <Phone className="w-3 h-3 text-gray-400" />
                          {row.vendorPhone}
                        </a>
                      )}
                      {row.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-gray-400" />
                          {row.location}
                        </span>
                      )}
                      {row.projectName && row.projectId && (
                        <Link href={`/projects/${row.projectId}`} className="inline-flex items-center gap-1 hover:text-orange-600">
                          <FolderKanban className="w-3 h-3 text-gray-400" />
                          {row.projectName}
                        </Link>
                      )}
                      {row.reference && (
                        <span className="inline-flex items-center gap-1">
                          <FileText className="w-3 h-3 text-gray-400" />
                          {row.reference}
                        </span>
                      )}
                    </div>

                    {row.workers.length > 0 && (
                      <ul className="mt-2 rounded-xl bg-gray-50 px-2.5 py-1.5 space-y-0.5">
                        {row.workers.slice(0, WORKERS_SHOWN).map((w) => (
                          <li key={w.name} className="flex items-center justify-between gap-2 text-xs text-gray-600">
                            <span className="truncate">
                              {w.name} <span className="text-gray-400">· {workerRoleLabel[w.role]}</span>
                            </span>
                            <span className="flex-shrink-0 font-medium text-gray-700">
                              {w.dailyRate != null ? `${baht(w.dailyRate)}/วัน` : "—"}
                            </span>
                          </li>
                        ))}
                        {row.workers.length > WORKERS_SHOWN && (
                          <li className="text-[11px] text-gray-400">และอีก {row.workers.length - WORKERS_SHOWN} คน (ดูทั้งหมดในหน้าประวัติ)</li>
                        )}
                      </ul>
                    )}
                    {row.paidAmount > 0 && row.paidDateKey && (
                      <p className="text-[11px] text-gray-400 mt-1">จ่ายเมื่อ {formatThaiDateLong(row.paidDateKey)}</p>
                    )}
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
