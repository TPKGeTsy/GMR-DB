"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import DateRangePresets from "./DateRangePresets";

export default function ActivityLogFilters({ actions }: { actions: string[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const from = searchParams.get("logFrom") || "";
  const to = searchParams.get("logTo") || "";
  const action = searchParams.get("logAction") || "";

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("logPage");
    router.push(`?${params.toString()}`);
  };

  const hasFilters = from || to || action;

  return (
    <div className="px-6 py-3 border-b border-gray-100 bg-gray-50/50 space-y-2">
      <DateRangePresets fromParam="logFrom" toParam="logTo" pageParam="logPage" />
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="log-from" className="block text-[10px] text-gray-500 mb-0.5">
            ตั้งแต่วันที่
          </label>
          <input
            id="log-from"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => updateParam("logFrom", e.target.value)}
            className="rounded-md border-gray-300 text-xs h-8 px-2 focus:border-orange-500 focus:ring-orange-500 text-gray-900"
          />
        </div>
        <div>
          <label htmlFor="log-to" className="block text-[10px] text-gray-500 mb-0.5">
            ถึงวันที่
          </label>
          <input
            id="log-to"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => updateParam("logTo", e.target.value)}
            className="rounded-md border-gray-300 text-xs h-8 px-2 focus:border-orange-500 focus:ring-orange-500 text-gray-900"
          />
        </div>
        <div>
          <label htmlFor="log-action" className="block text-[10px] text-gray-500 mb-0.5">
            ประเภทกิจกรรม
          </label>
          <select
            id="log-action"
            value={action}
            onChange={(e) => updateParam("logAction", e.target.value)}
            className="rounded-md border-gray-300 text-xs h-8 px-2 focus:border-orange-500 focus:ring-orange-500 text-gray-900"
          >
            <option value="">ทั้งหมด</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        {hasFilters && (
          <button
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              ["logFrom", "logTo", "logAction", "logPage"].forEach((k) => params.delete(k));
              router.push(`?${params.toString()}`);
            }}
            className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-red-600 h-8"
          >
            <X className="w-3 h-3" />
            ล้างตัวกรอง
          </button>
        )}
      </div>
    </div>
  );
}
