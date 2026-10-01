"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { setWageOverride, clearWageOverride } from "@/app/actions/wages";

/** Inline "override this day's pay" editor — for the rare double-wage day,
 *  or a long overnight OT session that should also credit a full regular
 *  day's wage for the day it spills into. Same mechanism the /wages report
 *  uses (WageOverride replaces the whole day's computed total) — shared by
 *  the Attendance day panel and the employee profile page so both stay in
 *  sync with the same underlying data. */
export default function WageOverrideEditor({
  userId,
  dateKey,
  currentRate,
  currentNote,
  onDone,
}: {
  userId: string;
  dateKey: string;
  currentRate: number | null;
  currentNote: string | null;
  onDone: () => void;
}) {
  const [rate, setRate] = useState(currentRate !== null ? String(currentRate) : "");
  const [note, setNote] = useState(currentNote || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const value = Number(rate);
    if (!Number.isFinite(value) || value < 0) {
      setError("ค่าแรงไม่ถูกต้อง");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await setWageOverride(userId, dateKey, value, note);
    if (!result.success) {
      setError(result.error || "บันทึกไม่สำเร็จ");
      setSaving(false);
      return;
    }
    onDone();
  };

  const clear = async () => {
    setSaving(true);
    setError(null);
    const result = await clearWageOverride(userId, dateKey);
    if (!result.success) {
      setError(result.error || "ลบไม่สำเร็จ");
      setSaving(false);
      return;
    }
    onDone();
  };

  return (
    <div className="mt-2 rounded-xl border border-purple-100 bg-purple-50/50 p-2.5 space-y-1.5" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min={0}
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder="ค่าแรงทั้งวัน (บาท)"
          autoFocus
          className="w-32 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
        />
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="หมายเหตุ เช่น ค่าแรง 2 เท่า"
          className="flex-1 min-w-0 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-2.5 py-1 rounded-full bg-purple-600 text-white text-[11px] font-semibold hover:bg-purple-700 disabled:opacity-50"
        >
          {saving ? "..." : "บันทึก"}
        </button>
        {currentRate !== null && (
          <button
            type="button"
            onClick={clear}
            disabled={saving}
            className="px-2.5 py-1 rounded-full border border-gray-200 text-gray-600 text-[11px] font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            ลบการปรับ
          </button>
        )}
        <button type="button" onClick={onDone} disabled={saving} className="text-gray-400 hover:text-gray-600 ml-auto">
          <X className="w-3.5 h-3.5" />
        </button>
        {error && <span className="text-[10px] text-red-600">{error}</span>}
      </div>
    </div>
  );
}
