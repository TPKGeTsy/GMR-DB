"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Columns3, Check, Pencil, UtensilsCrossed } from "lucide-react";
import { formatThaiDateLong, formatThaiTime } from "@/lib/datetime";
import { formatHoursTenths } from "@/lib/attendance";
import { setMealCounted, type AttendanceTableRow, type EmployeeOption } from "@/app/actions/checkin";
import EditCheckInModal from "./EditCheckInModal";

const STORAGE_KEY = "gmr-attendance-columns-v1";

type ColumnKey =
  | "date" | "employee" | "time" | "type" | "dailyTotalHours" | "dailyOtHours"
  | "location" | "note" | "confidence" | "photo" | "stillWorking";

interface ColumnDef {
  key: ColumnKey;
  label: string;
  defaultVisible: boolean;
}

const COLUMNS: ColumnDef[] = [
  { key: "date", label: "วันที่", defaultVisible: true },
  { key: "employee", label: "พนักงาน", defaultVisible: true },
  { key: "time", label: "เวลา (สแกน)", defaultVisible: true },
  { key: "type", label: "ประเภท (เข้า/ออก)", defaultVisible: true },
  { key: "dailyTotalHours", label: "ชม. รวมวันนั้น", defaultVisible: true },
  { key: "dailyOtHours", label: "OT วันนั้น", defaultVisible: true },
  { key: "location", label: "สถานที่", defaultVisible: true },
  { key: "note", label: "หมายเหตุ", defaultVisible: false },
  { key: "confidence", label: "ความแม่นยำ (%)", defaultVisible: false },
  { key: "photo", label: "รูปภาพ", defaultVisible: false },
  { key: "stillWorking", label: "สถานะวันนั้น", defaultVisible: false },
];

function loadVisibleColumns(): Set<ColumnKey> {
  const defaults = new Set(COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key));
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const saved: string[] = JSON.parse(raw);
    const validKeys = new Set(COLUMNS.map((c) => c.key));
    const restored = saved.filter((k): k is ColumnKey => validKeys.has(k as ColumnKey));
    return restored.length ? new Set(restored) : defaults;
  } catch {
    return defaults;
  }
}

export default function AttendanceTable({
  rows,
  employeeOptions,
}: {
  rows: AttendanceTableRow[];
  employeeOptions: EmployeeOption[];
}) {
  const router = useRouter();
  const [visible, setVisible] = useState<Set<ColumnKey>>(new Set(COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key)));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [editingRow, setEditingRow] = useState<AttendanceTableRow | null>(null);
  const [togglingMealId, setTogglingMealId] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const handleToggleMeal = async (row: AttendanceTableRow) => {
    setTogglingMealId(row.id);
    const result = await setMealCounted(row.id, !row.mealCounted);
    if (!result.success) {
      alert(result.error || "แก้ไขไม่สำเร็จ");
    } else {
      router.refresh();
    }
    setTogglingMealId(null);
  };

  useEffect(() => {
    // Reads from localStorage, a client-only external system unavailable
    // during SSR — can't be a lazy useState initializer without a
    // server/client hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(loadVisibleColumns());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(visible)));
    } catch {
      // localStorage can throw (private mode, blocked storage) — the toggle
      // still works for this session, it just won't persist across visits.
    }
  }, [visible, loaded]);

  useEffect(() => {
    if (!pickerOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [pickerOpen]);

  const toggleColumn = (key: ColumnKey) => {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const activeColumns = COLUMNS.filter((c) => visible.has(c.key));

  const renderCell = (row: AttendanceTableRow, key: ColumnKey) => {
    switch (key) {
      case "date":
        return formatThaiDateLong(row.dateKey);
      case "employee":
        return <span className="font-medium text-gray-900">{row.employeeName}</span>;
      case "time":
        return formatThaiTime(row.time);
      case "type":
        return (
          <span
            className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${
              row.type === "IN" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"
            }`}
          >
            {row.type === "IN" ? "เข้างาน" : "เลิกงาน"}
          </span>
        );
      case "dailyTotalHours":
        return row.dailyTotalHours !== null && row.dailyTotalHours > 0 ? `${formatHoursTenths(row.dailyTotalHours)} ชม.` : "-";
      case "dailyOtHours":
        return row.dailyOtHours !== null && row.dailyOtHours > 0 ? (
          <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-orange-100 text-orange-700">
            +{formatHoursTenths(row.dailyOtHours)} ชม.
          </span>
        ) : (
          <span className="text-gray-300">-</span>
        );
      case "location":
        return (
          <span
            className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${
              row.location === "OUTSIDE" ? "bg-yellow-100 text-yellow-800" : "bg-blue-100 text-blue-700"
            }`}
          >
            {row.location === "OUTSIDE" ? "นอกออฟฟิศ" : "ออฟฟิศ"}
          </span>
        );
      case "note":
        return row.note ? <span title={row.note} className="line-clamp-1 max-w-[200px] inline-block">{row.note}</span> : "-";
      case "confidence":
        return row.confidence != null ? `${Math.round(row.confidence * 100)}%` : <span className="text-gray-300">-</span>;
      case "photo":
        return row.photoUrl ? (
          <Image src={row.photoUrl} alt={row.employeeName} width={36} height={36} className="rounded-full object-cover border border-gray-200" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-gray-100 border border-gray-200" />
        );
      case "stillWorking":
        return row.stillWorking ? (
          <span className="inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-full bg-green-100 text-green-700">กำลังทำงาน</span>
        ) : (
          <span className="text-gray-400 text-xs">เสร็จแล้ว</span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-white shadow overflow-hidden sm:rounded-lg">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between relative">
        <p className="text-xs text-gray-500">เลือกคอลัมน์ที่ต้องการแสดงได้ — ระบบจะจำไว้ให้ในเบราว์เซอร์นี้</p>
        <div ref={pickerRef} className="relative">
          <button
            onClick={() => setPickerOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <Columns3 className="w-3.5 h-3.5" />
            คอลัมน์ ({activeColumns.length}/{COLUMNS.length})
          </button>
          {pickerOpen && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-md shadow-lg py-1.5 z-30">
              {COLUMNS.map((col) => (
                <button
                  key={col.key}
                  onClick={() => toggleColumn(col.key)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  {col.label}
                  {visible.has(col.key) && <Check className="w-4 h-4 text-orange-600" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {activeColumns.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap"
                >
                  {col.label}
                </th>
              ))}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={activeColumns.length + 1 || 1} className="px-4 py-10 text-center text-sm text-gray-500 italic">
                  ไม่มีข้อมูล
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                  {activeColumns.map((col) => (
                    <td key={col.key} className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                      {renderCell(row, col.key)}
                    </td>
                  ))}
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-2">
                      {row.location === "OUTSIDE" && (
                        <button
                          onClick={() => handleToggleMeal(row)}
                          disabled={togglingMealId === row.id}
                          className={row.mealCounted ? "text-orange-600 hover:text-orange-700" : "text-gray-300 hover:text-gray-500"}
                          title={row.mealCounted ? "ได้ข้าวมื้อนี้ — กดเพื่อยกเลิก" : "ไม่ได้ข้าวมื้อนี้ — กดเพื่อนับข้าว"}
                        >
                          <UtensilsCrossed className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => setEditingRow(row)}
                        className="text-gray-400 hover:text-orange-600"
                        title="แก้ไขรายการนี้"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editingRow && (
        <EditCheckInModal
          row={editingRow}
          employeeOptions={employeeOptions}
          onClose={() => setEditingRow(null)}
        />
      )}
    </div>
  );
}
