"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Filter, X } from "lucide-react";
import DateRangePresets from "./DateRangePresets";

export default function OtSummaryFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`?${params.toString()}`);
  };

  const hasFilters = from || to;

  return (
    <div className="bg-white shadow rounded-lg border border-gray-100 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mr-1">
          <Filter className="w-4 h-4 text-gray-400" />
          ช่วงวันที่
        </div>
        <DateRangePresets />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="summary-from" className="block text-[11px] text-gray-500 mb-1">
            ตั้งแต่วันที่
          </label>
          <input
            id="summary-from"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => updateParam("from", e.target.value)}
            className="rounded-md border-gray-300 text-sm h-9 px-2 focus:border-orange-500 focus:ring-orange-500 text-gray-900"
          />
        </div>

        <div>
          <label htmlFor="summary-to" className="block text-[11px] text-gray-500 mb-1">
            ถึงวันที่
          </label>
          <input
            id="summary-to"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => updateParam("to", e.target.value)}
            className="rounded-md border-gray-300 text-sm h-9 px-2 focus:border-orange-500 focus:ring-orange-500 text-gray-900"
          />
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
