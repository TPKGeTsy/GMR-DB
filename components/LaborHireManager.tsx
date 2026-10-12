"use client";

import { useState } from "react";
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
  paymentStatusOf,
  hireTypeLabel,
  contractTypeLabel,
  contractLabel,
  workerRoleLabel,
  normalizeName,
  HIRE_TYPES,
  CONTRACT_TYPES,
  type HireType,
  type ContractType,
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

interface SlotDraft {
  name: string;
  rate: string;
}
type Slots = Record<WorkerRole, SlotDraft[]>;

// The form draws one name+wage row per person hired, up to this many per
// group — enough for any realistic crew, and it keeps the modal snappy if
// someone types a huge headcount. Anyone beyond it counts as unnamed.
const SLOT_CAP = 50;
const ROLE_ORDER: WorkerRole[] = ["TECHNICIAN", "LABORER"];

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
    cost: editing ? String(editing.cost) : "",
    paidAmount: editing && editing.paidAmount > 0 ? String(editing.paidAmount) : "",
    paidDateKey: editing?.paidDateKey ?? "",
    trade: editing?.trade ?? "",
    location: editing?.location ?? "",
    reference: editing?.reference ?? "",
    note: editing?.note ?? "",
  });
  const [slots, setSlots] = useState<Slots>(() => {
    const initial: Slots = { TECHNICIAN: [], LABORER: [] };
    for (const w of editing?.workers ?? []) {
      initial[w.role].push({ name: w.name, rate: w.dailyRate != null ? String(w.dailyRate) : "" });
    }
    return initial;
  });
  const [bulkRate, setBulkRate] = useState<Record<WorkerRole, string>>({ TECHNICIAN: "", LABORER: "" });
  // The total follows the wages automatically until someone types their own.
  // An existing hire whose stored total already differs from what its wages
  // add up to was clearly set by hand, so it starts out manual.
  const [costManual, setCostManual] = useState(() => {
    if (!editing) return false;
    const perDay = editing.workers.reduce((sum, w) => sum + (w.dailyRate ?? 0), 0);
    return editing.cost !== editing.days * perDay;
  });
  const set = <K extends keyof typeof f>(key: K) => (value: (typeof f)[K]) => setF((prev) => ({ ...prev, [key]: value }));
  const onText = (key: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((prev) => ({ ...prev, [key]: e.target.value }));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The headcount drives how many name+wage rows exist; a row left without a
  // name is simply an unnamed hire (it isn't stored as a person).
  const counts: Record<WorkerRole, number> = { TECHNICIAN: num(f.technicianCount), LABORER: num(f.laborerCount) };
  const techCount = counts.TECHNICIAN;
  const laborCount = counts.LABORER;
  const slotAt = (role: WorkerRole, i: number): SlotDraft => slots[role][i] ?? { name: "", rate: "" };
  const lastFilled = (role: WorkerRole) => slots[role].reduce((last, slot, i) => (slot.name.trim() ? i : last), -1);
  const visibleSlots = (role: WorkerRole) => Math.min(counts[role], Math.max(SLOT_CAP, lastFilled(role) + 1));
  const workersInput = ROLE_ORDER.flatMap((role) =>
    slots[role]
      .slice(0, counts[role])
      .filter((slot) => slot.name.trim() !== "")
      .map((slot) => ({ name: slot.name, role, dailyRate: numOrNull(slot.rate) }))
  );

  const days = f.days.trim() === "" ? 1 : Number(f.days);
  // Every wage typed in a row counts toward the total, named or not.
  const perDayWages = ROLE_ORDER.reduce(
    (sum, role) => sum + slots[role].slice(0, counts[role]).reduce((s, slot) => s + num(slot.rate), 0),
    0
  );
  const autoCost = days * perDayWages;
  const effectiveCost = costManual ? num(f.cost) : autoCost;
  const status = paymentStatusOf(effectiveCost, num(f.paidAmount));
  const hasExtras = !!(f.trade || f.location || f.reference);

  const setSlot = (role: WorkerRole, index: number, patch: Partial<SlotDraft>) =>
    setSlots((prev) => {
      const list = [...prev[role]];
      while (list.length <= index) list.push({ name: "", rate: "" });
      list[index] = { ...list[index], ...patch };
      return { ...prev, [role]: list };
    });

  const fillSlotFrom = (role: WorkerRole, index: number, s: VendorSuggestion) =>
    setSlot(role, index, {
      name: s.name,
      // What we agreed with them last time is the best starting point.
      ...(s.lastRate !== null ? { rate: String(s.lastRate) } : {}),
    });

  /** "Same wage for everyone": fills every empty wage box in the group. */
  const fillEmptyRates = (role: WorkerRole) => {
    const rate = bulkRate[role].trim();
    if (!rate) return;
    setSlots((prev) => {
      const list = [...prev[role]];
      for (let i = 0; i < visibleSlots(role); i++) {
        while (list.length <= i) list.push({ name: "", rate: "" });
        if (list[i].rate.trim() === "") list[i] = { ...list[i], rate };
      }
      return { ...prev, [role]: list };
    });
  };

  /** Picking from the contractor field: a company fills the vendor; a person
   *  goes into the first free name row of their usual group (the contractor
   *  field is for companies). */
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

    const alreadyListed = ROLE_ORDER.some((r) => slots[r].slice(0, counts[r]).some((x) => normalizeName(x.name) === s.key));
    if (alreadyListed) return;

    const role: WorkerRole = s.lastRole ?? "LABORER";
    let index = -1;
    for (let i = 0; i < counts[role]; i++) {
      if (!slotAt(role, i).name.trim()) {
        index = i;
        break;
      }
    }
    if (index === -1) {
      // Every row is taken, so this is one more person hired in that group.
      index = counts[role];
      setF((prev) => ({ ...prev, [role === "TECHNICIAN" ? "technicianCount" : "laborerCount"]: String(index + 1) }));
    }
    setSlot(role, index, { name: s.name, rate: s.lastRate !== null ? String(s.lastRate) : "" });
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
      cost: effectiveCost,
      note: f.note,
      hireType: f.hireType,
      vendorName: f.vendorName,
      vendorPhone: f.vendorPhone,
      trade: f.trade,
      location: f.location,
      reference: f.reference,
      contractType: f.contractType,
      days,
      rateMode: "LUMP_SUM" as const,
      technicianRate: null,
      laborerRate: null,
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
          {counts.TECHNICIAN + counts.LABORER === 0 && (
            <p className="text-[11px] text-gray-400">
              ใส่จำนวนช่าง/คนงานด้านบน แล้วช่องกรอกชื่อและค่าแรงจะขึ้นให้ตามจำนวนอัตโนมัติ
            </p>
          )}

          {ROLE_ORDER.map((role) => {
            const count = counts[role];
            if (count <= 0) return null;
            const shown = visibleSlots(role);
            const Icon = role === "TECHNICIAN" ? Wrench : Users;
            return (
              <div key={role} className="rounded-2xl border border-gray-100 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-xs font-semibold text-gray-600 inline-flex items-center gap-1.5">
                    <Icon className="w-3.5 h-3.5 text-gray-400" />
                    {workerRoleLabel[role]} {count} คน — ชื่อและค่าแรงต่อวัน
                  </p>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      value={bulkRate[role]}
                      onChange={(e) => setBulkRate((prev) => ({ ...prev, [role]: e.target.value }))}
                      placeholder="เท่ากันทุกคน ฿/วัน"
                      className="w-36 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => fillEmptyRates(role)}
                      disabled={!bulkRate[role].trim()}
                      className="text-[11px] font-semibold text-orange-600 bg-orange-50 hover:bg-orange-100 disabled:opacity-40 rounded-full px-2.5 py-1 transition-colors"
                    >
                      ใส่ช่องที่ว่าง
                    </button>
                  </div>
                </div>

                <ul className="space-y-1.5">
                  {Array.from({ length: shown }, (_, i) => {
                    const slot = slotAt(role, i);
                    return (
                      <li key={i} className="grid grid-cols-[1.25rem_minmax(0,1fr)_5.5rem] items-center gap-2">
                        <span className="text-[11px] text-gray-400 text-right">{i + 1}</span>
                        <NameSuggest
                          value={slot.name}
                          onChange={(text) => setSlot(role, i, { name: text })}
                          onPick={(s) => fillSlotFrom(role, i, s)}
                          kinds={["PERSON"]}
                          maxLength={80}
                          placeholder="ชื่อ"
                          className="w-full min-w-0 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white outline-none"
                        />
                        <input
                          type="number"
                          min={0}
                          step={1}
                          inputMode="numeric"
                          value={slot.rate}
                          onChange={(e) => setSlot(role, i, { rate: e.target.value })}
                          placeholder="฿/วัน"
                          className="w-full min-w-0 rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white outline-none"
                        />
                      </li>
                    );
                  })}
                </ul>

                {count > shown && (
                  <p className="text-[11px] text-gray-400">
                    แสดง {shown} ช่องแรก — อีก {count - shown} คนที่เหลือไม่ต้องกรอกก็ได้
                  </p>
                )}
                <p className="text-[11px] text-gray-400">
                  ใส่ชื่อด้วยจะบันทึกลงประวัติของคนนั้น (พิมพ์เพื่อค้นหาคนที่เคยจ้างได้) · ใส่แค่ค่าแรงโดยไม่ใส่ชื่อก็นับเข้ายอดรวม
                </p>
              </div>
            );
          })}

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

          <div className="rounded-2xl border border-gray-100 p-3 space-y-2">
            <label className="text-xs text-gray-400">ค่าใช้จ่ายในการจ้าง (บาท รวมทั้งงาน)</label>
            <input
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={costManual ? f.cost : String(autoCost)}
              onChange={(e) => {
                setCostManual(true);
                set("cost")(e.target.value);
              }}
              placeholder="0"
              className={inputClass}
            />
            {costManual ? (
              <p className="text-[11px] text-gray-400">
                พิมพ์ยอดเอง
                {perDayWages > 0 && ` · ตามค่าแรงที่กรอกจะได้ ${baht(autoCost)}`}{" "}
                <button type="button" onClick={() => setCostManual(false)} className="font-semibold text-orange-600 hover:text-orange-700">
                  คำนวณจากค่าแรงใหม่
                </button>
              </p>
            ) : perDayWages > 0 ? (
              <p className="text-[11px] text-gray-400">
                คำนวณอัตโนมัติ: ค่าแรงรวม {baht(perDayWages)}/วัน × {days} วัน (พิมพ์แก้ยอดเองได้)
              </p>
            ) : (
              <p className="text-[11px] text-gray-400">
                ใส่ค่าแรงรายคนด้านบน ระบบจะรวมยอดให้ในช่องนี้เอง (หรือพิมพ์ยอดเองก็ได้)
              </p>
            )}
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

          <div>
            <label className="text-xs text-gray-400">หมายเหตุ (ถ้ามี)</label>
            <textarea
              value={f.note}
              onChange={onText("note")}
              rows={2}
              maxLength={500}
              placeholder="เช่น ข้อตกลงพิเศษกับผู้รับเหมา, เงื่อนไขการจ่ายเงิน, สิ่งที่ต้องระวังในงานนี้"
              className={`${inputClass} resize-none`}
            />
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
