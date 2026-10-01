"use client";

import { useState } from "react";
import { Wallet, Plus } from "lucide-react";
import { getUserWageOverrides, type WageOverrideRow } from "@/app/actions/wages";
import { formatThaiDateLong } from "@/lib/datetime";
import WageOverrideEditor from "./WageOverrideEditor";

/** Admin-only view of one employee's wage-override history (double-wage
 *  days, an overnight-OT day that also credits a regular day's pay, etc.)
 *  — the same WageOverride records the Attendance day panel and /wages
 *  report edit, just listed here for a quick look at one person's history. */
export default function UserWageOverridesPanel({ userId, initialOverrides }: { userId: string; initialOverrides: WageOverrideRow[] }) {
  const [overrides, setOverrides] = useState(initialOverrides);
  const [editingDateKey, setEditingDateKey] = useState<string | null>(null);
  const [newDate, setNewDate] = useState("");

  const reload = async () => {
    const result = await getUserWageOverrides(userId);
    if (result.success) setOverrides(result.data);
    setEditingDateKey(null);
    setNewDate("");
  };

  return (
    <div className="bg-white shadow-sm rounded-3xl border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-gray-900 flex items-center">
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-50 mr-2">
            <Wallet className="h-4 w-4 text-purple-600" />
          </span>
          ค่าแรงที่ปรับพิเศษ
        </h2>
      </div>

      {editingDateKey === "__new__" ? (
        <div className="mb-3 space-y-2">
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
          />
          {newDate && (
            <WageOverrideEditor
              userId={userId}
              dateKey={newDate}
              currentRate={overrides.find((o) => o.dateKey === newDate)?.rate ?? null}
              currentNote={overrides.find((o) => o.dateKey === newDate)?.note ?? null}
              onDone={reload}
            />
          )}
        </div>
      ) : (
        <button
          onClick={() => setEditingDateKey("__new__")}
          className="mb-3 inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 font-semibold bg-purple-50 hover:bg-purple-100 rounded-full px-2.5 py-1 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          เพิ่มการปรับค่าแรง
        </button>
      )}

      {overrides.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-6 bg-gray-50 rounded-2xl">ไม่มีประวัติการปรับค่าแรง</p>
      ) : (
        <ul className="space-y-2">
          {overrides.map((o) => (
            <li key={o.dateKey} className="rounded-2xl border border-gray-100 p-3">
              {editingDateKey === o.dateKey ? (
                <>
                  <p className="text-sm font-semibold text-gray-900">{formatThaiDateLong(o.dateKey)}</p>
                  <WageOverrideEditor
                    userId={userId}
                    dateKey={o.dateKey}
                    currentRate={o.rate}
                    currentNote={o.note}
                    onDone={reload}
                  />
                </>
              ) : (
                <button onClick={() => setEditingDateKey(o.dateKey)} className="w-full text-left">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900">{formatThaiDateLong(o.dateKey)}</p>
                    <p className="text-sm font-bold text-purple-700">{o.rate.toLocaleString("th-TH")} บาท</p>
                  </div>
                  {o.note && <p className="text-xs text-gray-500 mt-0.5">{o.note}</p>}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
