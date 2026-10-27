"use client";

import { useState } from "react";
import { TrendingUp, Trash2 } from "lucide-react";
import {
  changeInternGrade,
  deleteInternGradeChange,
  getInternGradeHistory,
  type InternGradeChangeRow,
} from "@/app/actions/wages";
import { formatThaiDate } from "@/lib/datetime";
import { gradeBadgeClass } from "@/lib/gradeColor";

/** Admin-only: the intern's grade month to month. Each row says "from this
 *  date the grade is X"; every worked day is paid at the grade in force that
 *  day (A until 31 Aug, A+ from 1 Sep). */
export default function InternGradeHistoryPanel({
  userId,
  initial,
  gradeOptions,
  today,
}: {
  userId: string;
  initial: InternGradeChangeRow[];
  gradeOptions: string[];
  today: string;
}) {
  const [rows, setRows] = useState(initial);
  const [grade, setGrade] = useState(gradeOptions[0] ?? "");
  const [from, setFrom] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    const result = await getInternGradeHistory(userId);
    if (result.success) setRows(result.data);
  };

  const add = async () => {
    if (!grade || !from) return;
    setBusy(true);
    setError(null);
    const result = await changeInternGrade(userId, grade, from);
    if (!result.success) setError(result.error ?? "บันทึกไม่สำเร็จ");
    else await reload();
    setBusy(false);
  };

  const remove = async (id: string) => {
    if (!window.confirm("ลบรายการเกรดนี้? ค่าแรงของวันที่เกี่ยวข้องจะคำนวณใหม่")) return;
    setBusy(true);
    const result = await deleteInternGradeChange(id);
    if (!result.success) setError(result.error ?? "ลบไม่สำเร็จ");
    else await reload();
    setBusy(false);
  };

  return (
    <div className="bg-white shadow-sm rounded-3xl border border-gray-100 p-6">
      <h2 className="mb-1 flex items-center text-sm font-bold text-gray-900">
        <span className="mr-2 flex h-8 w-8 items-center justify-center rounded-full bg-orange-50">
          <TrendingUp className="h-4 w-4 text-orange-600" />
        </span>
        ประวัติเกรด (เปลี่ยนรายเดือน)
      </h2>
      <p className="mb-3 text-xs text-gray-500">
        กำหนดว่า “ตั้งแต่วันที่นี้เป็นต้นไป” ใช้เกรดอะไร เช่น A ถึงสิ้นเดือน 8 แล้ว A+ ตั้งแต่ 1 เดือน 9 วันที่ก่อนรายการแรกใช้เกรดของรายการแรก
      </p>

      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <label className="text-xs text-gray-500">
          ตั้งแต่วันที่
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-0.5 block rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
          />
        </label>
        <label className="text-xs text-gray-500">
          เกรด
          <select
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            className="mt-0.5 block rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
          >
            {gradeOptions.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={add}
          disabled={busy || !grade || !from}
          className="rounded-full bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
        >
          เพิ่ม / เปลี่ยนเกรด
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs italic text-gray-400">ยังไม่มีประวัติ — ใช้เกรดปัจจุบันตลอด</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="text-gray-700">ตั้งแต่ {formatThaiDate(r.effectiveFrom + "T00:00:00+07:00")}</span>
              <span className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${gradeBadgeClass(r.grade)}`}>{r.grade}</span>
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  disabled={busy}
                  className="text-gray-400 hover:text-red-600"
                  title="ลบรายการนี้"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
