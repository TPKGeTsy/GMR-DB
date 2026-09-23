"use client";

import { useRouter, useSearchParams } from "next/navigation";
import DateRangePresets from "./DateRangePresets";

export default function ProfileSummaryFilters({ defaultFrom, defaultTo }: { defaultFrom: string; defaultTo: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const from = searchParams.get("sumFrom") || defaultFrom;
  const to = searchParams.get("sumTo") || defaultTo;

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="space-y-2 mb-4">
      <DateRangePresets fromParam="sumFrom" toParam="sumTo" pageParam="sumPage" />
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="sum-from" className="block text-[10px] text-gray-500 mb-0.5">
            ตั้งแต่วันที่
          </label>
          <input
            id="sum-from"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => updateParam("sumFrom", e.target.value)}
            className="rounded-md border-gray-300 text-xs h-8 px-2 focus:border-orange-500 focus:ring-orange-500 text-gray-900"
          />
        </div>
        <div>
          <label htmlFor="sum-to" className="block text-[10px] text-gray-500 mb-0.5">
            ถึงวันที่
          </label>
          <input
            id="sum-to"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => updateParam("sumTo", e.target.value)}
            className="rounded-md border-gray-300 text-xs h-8 px-2 focus:border-orange-500 focus:ring-orange-500 text-gray-900"
          />
        </div>
      </div>
    </div>
  );
}
