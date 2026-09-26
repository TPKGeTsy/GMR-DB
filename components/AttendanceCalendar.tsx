"use client";

import { useEffect, useState } from "react";
import {
  getMonthActivity,
  getDaySummary,
  getEmployeeOptions,
  deleteAttendanceDay,
  type DaySummaryRow,
  type DayLoanRow,
  type EmployeeOption,
} from "@/app/actions/checkin";
import { formatThaiTime, bangkokTimeHHMM } from "@/lib/datetime";
import { REGULAR_HOURS_CAP, LUNCH_BREAK_HOURS, formatHoursTenths } from "@/lib/attendance";
import { ChevronLeft, ChevronRight, LogIn, LogOut, PackageMinus, PackagePlus, Loader2, Plus, Pencil, Trash2, MapPin } from "lucide-react";
import Link from "next/link";
import DayAttendanceModal from "./DayAttendanceModal";

const WEEKDAY_LABELS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const WEEKDAY_LABELS_FULL = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const MONTH_LABELS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const MONTH_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

function bangkokTodayKey(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

/** "อังคาร 24 ก.ย. 2569" instead of a raw "2026-09-24" — reads like a date
 *  chip in a mobile app, not a database key. */
function formatThaiDateChip(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const weekday = WEEKDAY_LABELS_FULL[new Date(year, month - 1, day).getDay()];
  return `${weekday} ${day} ${MONTH_SHORT[month - 1]} ${year + 543}`;
}

// A handful of soft, distinct avatar colors, picked deterministically per
// user id so the same person always gets the same color across reloads
// without needing to store one.
const AVATAR_PALETTE = [
  "bg-orange-100 text-orange-700",
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-purple-100 text-purple-700",
  "bg-pink-100 text-pink-700",
  "bg-teal-100 text-teal-700",
  "bg-amber-100 text-amber-700",
  "bg-indigo-100 text-indigo-700",
];
function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}
function initials(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

const LIVE_TICK_MS = 30_000;

/** Live "hours so far" for someone still checked in: the day's already-closed
 *  sessions (`priorHours`, frozen) plus the still-open session's elapsed time,
 *  re-rendered every 30s. Applies the same untracked-lunch heuristic the
 *  final total will get once they check out, so the number doesn't visibly
 *  jump when that happens. */
function LiveElapsedHours({ priorHours, openSince }: { priorHours: number; openSince: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), LIVE_TICK_MS);
    return () => clearInterval(interval);
  }, []);

  let openMs = now - new Date(openSince).getTime();
  if (openMs > REGULAR_HOURS_CAP * 3_600_000) openMs -= LUNCH_BREAK_HOURS * 3_600_000;
  const liveHours = priorHours + Math.max(0, openMs) / 3_600_000;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2 py-0.5 font-semibold text-green-700">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
      </span>
      {formatHoursTenths(liveHours)} ชม.
    </span>
  );
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
  const [employeeOptions, setEmployeeOptions] = useState<EmployeeOption[]>([]);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editingRow, setEditingRow] = useState<DaySummaryRow | null>(null);

  useEffect(() => {
    getEmployeeOptions().then((result) => {
      if (result.success && result.data) setEmployeeOptions(result.data);
    });
  }, []);

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

  const reloadDaySummary = () => {
    getDaySummary(selectedDate).then((result) => {
      setSummary(result.success && result.data ? result.data : { attendance: [], borrowed: [], returned: [] });
      setLoadingDay(false);
    });
  };

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

  const handleDeleteRow = async (row: DaySummaryRow) => {
    if (!confirm(`ลบรายการเข้างานของ "${row.employeeName}" วันที่ ${selectedDate} ทั้งหมดถาวร?`)) return;
    const result = await deleteAttendanceDay({ userId: row.userId, dateKey: selectedDate });
    if (!result.success) {
      alert(result.error || "ลบไม่สำเร็จ");
      return;
    }
    reloadDaySummary();
  };

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
    <div className="bg-white shadow-sm rounded-3xl border border-gray-100 p-4 sm:p-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => goToMonth(-1)}
              className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-100 active:bg-gray-200 text-gray-500 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <p className="text-sm font-semibold text-gray-900 flex items-center">
              {MONTH_LABELS[viewMonth - 1]} {viewYear + 543}
              {loadingMonth && <Loader2 className="inline w-3 h-3 ml-1.5 animate-spin text-gray-400" />}
            </p>
            <button
              onClick={() => goToMonth(1)}
              className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-100 active:bg-gray-200 text-gray-500 transition-colors"
            >
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
                  className={`relative aspect-square rounded-full text-xs flex items-center justify-center transition-all active:scale-90 ${
                    isSelected
                      ? "bg-orange-600 text-white font-semibold shadow-md shadow-orange-200"
                      : isToday
                        ? "bg-orange-50 text-orange-700 font-semibold ring-1 ring-orange-200"
                        : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {day}
                  {hasActivity && !isSelected && (
                    <span className="absolute bottom-1 w-1 h-1 rounded-full bg-orange-500" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-900">{formatThaiDateChip(selectedDate)}</h3>
              {selectedDate === todayKey && (
                <span className="inline-block mt-0.5 text-[10px] font-semibold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full">
                  วันนี้
                </span>
              )}
            </div>
            {loadingDay && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">การเข้างาน</p>
              <button
                onClick={() => {
                  setEditingRow(null);
                  setModal("add");
                }}
                className="inline-flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 active:text-orange-800 font-semibold bg-orange-50 hover:bg-orange-100 rounded-full px-2.5 py-1 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                เพิ่มรายการ
              </button>
            </div>
            {!loadingDay && summary?.attendance.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6 bg-gray-50 rounded-2xl">ไม่มีใครเช็คอินในวันนี้</p>
            ) : (
              <ul className="space-y-2">
                {summary?.attendance.map((row) => {
                  const wentOutside = row.events.some((e) => e.location === "OUTSIDE");
                  const outsideNoteRaw = row.events.find((e) => e.location === "OUTSIDE" && e.note)?.note;
                  const outsideMarker = "ออกหน้างาน: ";
                  const outsideNote = outsideNoteRaw
                    ? (() => {
                        const idx = outsideNoteRaw.indexOf(outsideMarker);
                        return idx >= 0 ? outsideNoteRaw.slice(idx + outsideMarker.length) : outsideNoteRaw;
                      })()
                    : null;
                  return (
                  <li
                    key={row.userId}
                    className={`rounded-2xl border p-3 transition-colors ${
                      wentOutside ? "border-amber-100 bg-amber-50/40" : "border-gray-100 bg-white"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div
                        className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${avatarColor(row.userId)}`}
                      >
                        {initials(row.employeeName)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-sm text-gray-900 font-semibold flex items-center gap-1.5 flex-wrap">
                            <Link href={`/users/${row.userId}`} className="hover:text-orange-600">
                              {row.employeeName}
                            </Link>
                            <span
                              className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                                wentOutside ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-700"
                              }`}
                            >
                              <MapPin className="w-2.5 h-2.5 mr-0.5" />
                              {wentOutside ? "ออกข้างนอก" : "ในออฟฟิศ"}
                            </span>
                            {row.stillWorking && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-green-50 px-1.5 py-0.5 rounded-full">
                                กำลังทำงาน
                              </span>
                            )}
                          </span>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => {
                                setEditingRow(row);
                                setModal("edit");
                              }}
                              title="แก้ไข"
                              className="flex items-center justify-center w-7 h-7 rounded-full text-gray-400 hover:text-orange-600 hover:bg-orange-50 transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteRow(row)}
                              title="ลบ"
                              className="flex items-center justify-center w-7 h-7 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {(outsideNote || (row.outsideStartTime && row.outsideEndTime)) && (
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            {outsideNote && <span className="italic">{outsideNote}</span>}
                            {row.outsideStartTime && row.outsideEndTime && (
                              <>
                                {outsideNote && " — "}
                                ออกหน้างาน{" "}
                                {row.tripId ? (
                                  <Link href={`/outside-trip/${row.tripId}`} className="underline hover:text-orange-600">
                                    {formatThaiTime(row.outsideStartTime)}–{formatThaiTime(row.outsideEndTime)}
                                  </Link>
                                ) : (
                                  <>
                                    {formatThaiTime(row.outsideStartTime)}–{formatThaiTime(row.outsideEndTime)}
                                  </>
                                )}
                              </>
                            )}
                          </p>
                        )}

                        <div className="mt-2 flex items-center justify-between flex-wrap gap-2">
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                            {row.events.map((e, i) => (
                              <span key={i} className="inline-flex items-center gap-0.5 text-[11px] text-gray-500">
                                {e.type === "IN" ? (
                                  <LogIn className="w-3 h-3 text-green-500" />
                                ) : (
                                  <LogOut className="w-3 h-3 text-gray-400" />
                                )}
                                {formatThaiTime(e.time)}
                              </span>
                            ))}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-600">
                            {row.stillWorking && row.openSince ? (
                              <LiveElapsedHours priorHours={row.totalHours} openSince={row.openSince} />
                            ) : (
                              <span>{formatHoursTenths(row.totalHours)} ชม.</span>
                            )}
                            {row.otHours > 0 && (
                              <span className="rounded-full bg-purple-50 text-purple-700 px-2 py-0.5 font-semibold">
                                OT {formatHoursTenths(row.otHours)} ชม.
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">ยืม / คืนของ</p>
            {!loadingDay && summary?.borrowed.length === 0 && summary?.returned.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6 bg-gray-50 rounded-2xl">ไม่มีการยืม/คืนของในวันนี้</p>
            ) : (
              <ul className="space-y-2">
                {summary?.borrowed.map((l) => (
                  <li key={`b-${l.id}`} className="rounded-2xl border border-gray-100 bg-white px-3 py-2.5 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm text-gray-900 truncate">
                      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-orange-50 flex items-center justify-center">
                        <PackageMinus className="w-3.5 h-3.5 text-orange-500" />
                      </span>
                      <span className="truncate">
                        <Link href={`/users/${l.employeeId}`} className="hover:text-orange-600 font-medium">
                          {l.employeeName}
                        </Link>{" "}
                        ยืม {l.assetName} x{l.quantity}
                      </span>
                    </span>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">{formatThaiTime(l.time)}</span>
                  </li>
                ))}
                {summary?.returned.map((l) => (
                  <li key={`r-${l.id}`} className="rounded-2xl border border-gray-100 bg-white px-3 py-2.5 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm text-gray-900 truncate">
                      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center">
                        <PackagePlus className="w-3.5 h-3.5 text-blue-500" />
                      </span>
                      <span className="truncate">
                        <Link href={`/users/${l.employeeId}`} className="hover:text-orange-600 font-medium">
                          {l.employeeName}
                        </Link>{" "}
                        คืน {l.assetName} x{l.quantity}
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

      {modal && (
        <DayAttendanceModal
          dateKey={selectedDate}
          employeeOptions={employeeOptions}
          editing={
            modal === "edit" && editingRow
              ? {
                  userId: editingRow.userId,
                  startTime: editingRow.startTime ? bangkokTimeHHMM(editingRow.startTime) : "09:00",
                  endTime: editingRow.endTime ? bangkokTimeHHMM(editingRow.endTime) : "17:00",
                  wentOutside: editingRow.events.some((e) => e.location === "OUTSIDE"),
                  outsideStartTime: editingRow.outsideStartTime ? bangkokTimeHHMM(editingRow.outsideStartTime) : undefined,
                  outsideEndTime: editingRow.outsideEndTime ? bangkokTimeHHMM(editingRow.outsideEndTime) : undefined,
                }
              : undefined
          }
          onClose={() => setModal(null)}
          onSaved={reloadDaySummary}
        />
      )}
    </div>
  );
}
