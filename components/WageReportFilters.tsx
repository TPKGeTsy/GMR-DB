"use client";

import { useRouter, useSearchParams } from "next/navigation";
import DateRangePresets from "./DateRangePresets";

export default function WageReportFilters({ defaultFrom, defaultTo }: { defaultFrom: string; defaultTo: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const from = searchParams.get("from") || defaultFrom;
  const to = searchParams.get("to") || defaultTo;

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="space-y-2 mb-4">
      <DateRangePresets fromParam="from" toParam="to" />
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="wage-from" className="block text-[10px] text-gray-500 mb-0.5">
            ตั้งแต่วันที่
          </label>
          <input
            id="wage-from"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => updateParam("from", e.target.value)}
            className="rounded-md border-gray-300 text-xs h-8 px-2 focus:border-orange-500 focus:ring-orange-500 text-gray-900"
          />
        </div>
        <div>
          <label htmlFor="wage-to" className="block text-[10px] text-gray-500 mb-0.5">
            ถึงวันที่
          </label>
          <input
            id="wage-to"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => updateParam("to", e.target.value)}
            className="rounded-md border-gray-300 text-xs h-8 px-2 focus:border-orange-500 focus:ring-orange-500 text-gray-900"
          />
        </div>
      </div>
    </div>
  );
}
