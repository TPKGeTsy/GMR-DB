"use client";

import { useEffect, useState } from "react";
import {
  getMonthActivity,
  getDaySummary,
  type DaySummaryRow,
  type DayLoanRow,
} from "@/app/actions/checkin";
import { formatThaiTime } from "@/lib/datetime";
import { ChevronLeft, ChevronRight, LogIn, LogOut, PackageMinus, PackagePlus, Loader2 } from "lucide-react";

const WEEKDAY_LABELS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const MONTH_LABELS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function bangkokTodayKey(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

function buildMonthGrid(year: number, month: number): (string | null)[] {
  // `month` is 1-12; JS Date's month param is 0-indexed. Only used to lay
  // out the grid (weekday-of-month, day count) — never for event data, so
  // running in the browser's own local timezone is fine here.
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells: (string | null)[] = Array(firstWeekday).fill(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  return cells;
}

export default function AttendanceCalendar() {
  const todayKey = bangkokTodayKey();
  const [todayYear, todayMonth] = todayKey.split("-").map(Number);

  const [viewYear, setViewYear] = useState(todayYear);
  const [viewMonth, setViewMonth] = useState(todayMonth);
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [activeDates, setActiveDates] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState<{ attendance: DaySummaryRow[]; borrowed: DayLoanRow[]; returned: DayLoanRow[] } | null>(null);
  const [loadingMonth, setLoadingMonth] = useState(true);
  const [loadingDay, setLoadingDay] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getMonthActivity(viewYear, viewMonth).then((result) => {
      if (cancelled) return;
      setActiveDates(result.success && result.data ? new Set(result.data) : new Set());
      setLoadingMonth(false);
    });
    return () => {
      cancelled = true;
    };
  }, [viewYear, viewMonth]);

  useEffect(() => {
    let cancelled = false;
    getDaySummary(selectedDate).then((result) => {
      if (cancelled) return;
      setSummary(result.success && result.data ? result.data : { attendance: [], borrowed: [], returned: [] });
      setLoadingDay(false);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  const goToMonth = (delta: number) => {
    let newMonth = viewMonth + delta;
    let newYear = viewYear;
    if (newMonth > 12) {
      newMonth = 1;
      newYear++;
    } else if (newMonth < 1) {
      newMonth = 12;
      newYear--;
    }
    setLoadingMonth(true);
    setViewYear(newYear);
    setViewMonth(newMonth);
  };

  const selectDate = (dateKey: string) => {
    setLoadingDay(true);
    setSelectedDate(dateKey);
  };

  const cells = buildMonthGrid(viewYear, viewMonth);

  return (
    <div className="bg-white shadow rounded-lg border border-gray-100 p-4 sm:p-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => goToMonth(-1)} className="p-1 rounded hover:bg-gray-100 text-gray-500">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <p className="text-sm font-semibold text-gray-900">
              {MONTH_LABELS[viewMonth - 1]} {viewYear + 543}
              {loadingMonth && <Loader2 className="inline w-3 h-3 ml-1.5 animate-spin text-gray-400" />}
            </p>
            <button onClick={() => goToMonth(1)} className="p-1 rounded hover:bg-gray-100 text-gray-500">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAY_LABELS.map((w) => (
              <div key={w} className="text-[10px] font-medium text-gray-400 py-1">
                {w}
              </div>
            ))}
            {cells.map((dateKey, i) => {
              if (!dateKey) return <div key={`blank-${i}`} />;
              const day = Number(dateKey.slice(-2));
              const isSelected = dateKey === selectedDate;
              const isToday = dateKey === todayKey;
              const hasActivity = activeDates.has(dateKey);
              return (
                <button
                  key={dateKey}
                  onClick={() => selectDate(dateKey)}
                  className={`relative aspect-square rounded-md text-xs flex items-center justify-center transition-colors ${
                    isSelected
                      ? "bg-orange-600 text-white font-semibold"
                      : isToday
                        ? "bg-orange-50 text-orange-700 font-semibold"
                        : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {day}
                  {hasActivity && !isSelected && (
                    <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-orange-500" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">สรุปวันที่ {selectedDate}</h3>
            {loadingDay && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
          </div>

          <div>
            <p className="text-xs font-medium text-gray-500 mb-1.5">การเข้างาน</p>
            {!loadingDay && summary?.attendance.length === 0 ? (
              <p className="text-xs text-gray-400">ไม่มีใครเช็คอินในวันนี้</p>
            ) : (
              <ul className="divide-y divide-gray-100 border border-gray-100 rounded-md overflow-hidden">
                {summary?.attendance.map((row) => (
                  <li key={row.userId} className="px-3 py-2 bg-white">
                    <div className="flex items-center justify-between flex-wrap gap-1">
                      <span className="text-sm text-gray-900 font-medium">{row.employeeName}</span>
                      <span className="text-[10px] text-gray-500">
                        {row.totalHours.toFixed(1)} ชม.{row.otHours > 0 && ` (OT ${row.otHours.toFixed(1)} ชม.)`}
                        {row.stillWorking && <span className="ml-1.5 text-green-600 font-semibold">กำลังทำงาน</span>}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                      {row.events.map((e, i) => (
                        <span key={i} className="inline-flex items-center gap-0.5 text-[10px] text-gray-500">
                          {e.type === "IN" ? (
                            <LogIn className="w-2.5 h-2.5 text-green-500" />
                          ) : (
                            <LogOut className="w-2.5 h-2.5 text-gray-400" />
                          )}
                          {formatThaiTime(e.time)}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="text-xs font-medium text-gray-500 mb-1.5">ยืม / คืนของ</p>
            {!loadingDay && summary?.borrowed.length === 0 && summary?.returned.length === 0 ? (
              <p className="text-xs text-gray-400">ไม่มีการยืม/คืนของในวันนี้</p>
            ) : (
              <ul className="divide-y divide-gray-100 border border-gray-100 rounded-md overflow-hidden">
                {summary?.borrowed.map((l) => (
                  <li key={`b-${l.id}`} className="px-3 py-2 bg-white flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-sm text-gray-900 truncate">
                      <PackageMinus className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />
                      <span className="truncate">
                        {l.employeeName} ยืม {l.assetName} x{l.quantity}
                      </span>
                    </span>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">{formatThaiTime(l.time)}</span>
                  </li>
                ))}
                {summary?.returned.map((l) => (
                  <li key={`r-${l.id}`} className="px-3 py-2 bg-white flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-sm text-gray-900 truncate">
                      <PackagePlus className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                      <span className="truncate">
                        {l.employeeName} คืน {l.assetName} x{l.quantity}
                      </span>
                    </span>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">{formatThaiTime(l.time)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
