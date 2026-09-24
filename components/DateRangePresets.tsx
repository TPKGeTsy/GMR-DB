"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { bangkokDateKey } from "@/lib/datetime";

// Bangkok has a fixed +07:00 offset (no DST), so shifting an instant by
// whole UTC days always lands on the same wall-clock time on the shifted
// Bangkok calendar day — the same trick used elsewhere in this app
// (bangkokDateAt/bangkokDayRange) to avoid pulling in a timezone library.
function shiftDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00+07:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return bangkokDateKey(d);
}

function startOfMonth(dateKey: string): string {
  return `${dateKey.slice(0, 7)}-01`;
}

function shiftMonths(monthStartKey: string, months: number): string {
  const [y, m] = monthStartKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

// Date.UTC's day-0 rolls back into the previous month, so passing the
// 1-indexed current month straight through (instead of month - 1) lands on
// that month's own last day.
function endOfMonth(monthStartKey: string): string {
  const [y, m] = monthStartKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// Payroll runs the 21st of one month through the 20th of the next (cutoff
// on the 20th, recount starts the 21st) — not a calendar month.
function payrollCycleContaining(dateKey: string): { from: string; to: string } {
  const [y, m, d] = dateKey.split("-").map(Number);
  const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
  if (d >= 21) {
    const nextMonthStart = shiftMonths(monthStart, 1);
    return { from: `${monthStart.slice(0, 7)}-21`, to: `${nextMonthStart.slice(0, 7)}-20` };
  }
  const prevMonthStart = shiftMonths(monthStart, -1);
  return { from: `${prevMonthStart.slice(0, 7)}-21`, to: `${monthStart.slice(0, 7)}-20` };
}

function shiftPayrollCycle(cycleFromKey: string, cycles: number): { from: string; to: string } {
  const monthStart = shiftMonths(`${cycleFromKey.slice(0, 7)}-01`, cycles);
  const nextMonthStart = shiftMonths(monthStart, 1);
  return { from: `${monthStart.slice(0, 7)}-21`, to: `${nextMonthStart.slice(0, 7)}-20` };
}

export default function DateRangePresets({
  fromParam = "from",
  toParam = "to",
  pageParam = "page",
}: {
  /** URL param names to write the range into — override when a page embeds
   *  more than one date range picker (e.g. the profile page's activity log
   *  filter uses "logFrom"/"logTo" so it doesn't collide with anything). */
  fromParam?: string;
  toParam?: string;
  pageParam?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = bangkokDateKey(new Date());

  const apply = (from: string, to: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(fromParam, from);
    params.set(toParam, to);
    params.delete(pageParam);
    router.push(`?${params.toString()}`);
  };

  const presets: { label: string; range: () => { from: string; to: string } }[] = [
    { label: "วันนี้", range: () => ({ from: today, to: today }) },
    {
      label: "เมื่อวาน",
      range: () => {
        const yesterday = shiftDays(today, -1);
        return { from: yesterday, to: yesterday };
      },
    },
    { label: "7 วันล่าสุด", range: () => ({ from: shiftDays(today, -6), to: today }) },
    { label: "เดือนนี้", range: () => ({ from: startOfMonth(today), to: today }) },
    {
      label: "เดือนที่แล้ว",
      range: () => {
        const lastMonthStart = shiftMonths(startOfMonth(today), -1);
        return { from: lastMonthStart, to: endOfMonth(lastMonthStart) };
      },
    },
    { label: "รอบเงินเดือนนี้ (21-20)", range: () => payrollCycleContaining(today) },
    {
      label: "รอบเงินเดือนที่แล้ว",
      range: () => shiftPayrollCycle(payrollCycleContaining(today).from, -1),
    },
  ];

  return (
    <div className="flex flex-wrap gap-1.5">
      {presets.map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={() => {
            const { from, to } = p.range();
            apply(from, to);
          }}
          className="px-2.5 py-1 rounded-full border border-gray-200 text-xs text-gray-600 hover:border-orange-400 hover:text-orange-600 hover:bg-orange-50"
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
