"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Filter, X } from "lucide-react";
import DateRangePresets from "./DateRangePresets";

export default function AttendanceFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";
  const type = searchParams.get("type") || "";
  const otOnly = searchParams.get("otOnly") === "1";

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page"); // a changed filter invalidates whatever page we were on
    router.push(`?${params.toString()}`);
  };

  const hasFilters = from || to || type || otOnly;

  return (
    <div className="bg-white shadow rounded-lg border border-gray-100 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mr-1">
          <Filter className="w-4 h-4 text-gray-400" />
          ตัวกรอง
        </div>
        <DateRangePresets />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="filter-from" className="block text-[11px] text-gray-500 mb-1">
            ตั้งแต่วันที่
          </label>
          <input
            id="filter-from"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => updateParam("from", e.target.value)}
            className="rounded-md border-gray-300 text-sm h-9 px-2 focus:border-orange-500 focus:ring-orange-500 text-gray-900"
          />
        </div>

        <div>
          <label htmlFor="filter-to" className="block text-[11px] text-gray-500 mb-1">
            ถึงวันที่
          </label>
          <input
            id="filter-to"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => updateParam("to", e.target.value)}
            className="rounded-md border-gray-300 text-sm h-9 px-2 focus:border-orange-500 focus:ring-orange-500 text-gray-900"
          />
        </div>

        <div>
          <label htmlFor="filter-type" className="block text-[11px] text-gray-500 mb-1">
            ประเภท
          </label>
          <select
            id="filter-type"
            value={type}
            onChange={(e) => updateParam("type", e.target.value)}
            className="rounded-md border-gray-300 text-sm h-9 px-2 focus:border-orange-500 focus:ring-orange-500 text-gray-900"
          >
            <option value="">ทั้งหมด (เข้า/ออก)</option>
            <option value="IN">เข้างานเท่านั้น</option>
            <option value="OUT">เลิกงานเท่านั้น</option>
          </select>
        </div>

        <div>
          <span className="block text-[11px] text-gray-500 mb-1">มุมมอง</span>
          <div className="inline-flex rounded-md border border-gray-300 h-9 overflow-hidden text-sm">
            <button
              type="button"
              onClick={() => updateParam("otOnly", "")}
              className={`px-3 h-full ${!otOnly ? "bg-orange-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              ทั้งหมด
            </button>
            <button
              type="button"
              onClick={() => updateParam("otOnly", "1")}
              className={`px-3 h-full border-l border-gray-300 ${otOnly ? "bg-orange-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              เฉพาะ OT
            </button>
          </div>
        </div>

        {hasFilters && (
          <button
            onClick={() => router.push("?")}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-red-600 h-9"
          >
            <X className="w-3.5 h-3.5" />
            ล้างตัวกรอง
          </button>
        )}
      </div>
    </div>
  );
}
