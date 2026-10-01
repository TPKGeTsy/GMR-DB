"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, MapPin, Pencil, Trash2, Plus, Loader2 } from "lucide-react";
import { getDaySummary, deleteAttendanceDay, type DaySummaryRow } from "@/app/actions/checkin";
import { formatThaiDateLong, formatThaiTime, bangkokTimeHHMM, bangkokDateKey } from "@/lib/datetime";
import { formatHoursTenths } from "@/lib/attendance";
import DayAttendanceModal from "./DayAttendanceModal";

export interface TimesheetRow {
  dateKey: string;
  startTime: string | null;
  endTime: string | null;
  stillWorking: boolean;
  totalHours: number;
  otHours: number;
  location: string | null;
}

/** Daily Timesheet, with admin-only add/edit/delete right from the profile
 *  page — same actions the Attendance day panel uses (getDaySummary to
 *  pull the full editable row, including the outside-trip sub-range the
 *  lighter buildDailySummary rows here don't carry; deleteAttendanceDay;
 *  DayAttendanceModal itself), just pre-scoped to this one employee so
 *  there's no "pick an employee" step. */
export default function UserDailyTimesheetPanel({
  userId,
  employeeName,
  rows,
  canEdit,
}: {
  userId: string;
  employeeName: string;
  rows: TimesheetRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editingRow, setEditingRow] = useState<DaySummaryRow | null>(null);
  const [modalDateKey, setModalDateKey] = useState<string | null>(null);
  const [loadingDateKey, setLoadingDateKey] = useState<string | null>(null);

  const employeeOptions = [{ id: userId, name: employeeName }];

  const openEdit = async (dateKey: string) => {
    setLoadingDateKey(dateKey);
    const result = await getDaySummary(dateKey);
    setLoadingDateKey(null);
    if (!result.success) {
      alert(result.error || "โหลดข้อมูลไม่สำเร็จ");
      return;
    }
    const row = result.data.attendance.find((r) => r.userId === userId);
    if (!row) {
      alert("ไม่พบรายการเข้างานวันนี้ของพนักงานคนนี้");
      return;
    }
    setEditingRow(row);
    setModalDateKey(dateKey);
    setModal("edit");
  };

  const openAdd = () => {
    setEditingRow(null);
    setModalDateKey(bangkokDateKey(new Date()));
    setModal("add");
  };

  const handleDelete = async (dateKey: string) => {
    if (!confirm(`ลบรายการเข้างานของ "${employeeName}" วันที่ ${dateKey} ทั้งหมดถาวร?`)) return;
    const result = await deleteAttendanceDay({ userId, dateKey });
    if (!result.success) {
      alert(result.error || "ลบไม่สำเร็จ");
      return;
    }
    router.refresh();
  };

  return (
    <div className="bg-white shadow rounded-lg border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <div className="flex items-center">
          <CalendarClock className="h-5 w-5 text-orange-600 mr-2" />
          <h2 className="text-sm font-semibold text-gray-900">Daily Timesheet</h2>
        </div>
        {canEdit && (
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 font-semibold bg-orange-50 hover:bg-orange-100 rounded-full px-2.5 py-1 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            เพิ่มรายการ
          </button>
        )}
      </div>
      <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="px-4 py-2 text-left text-[10px] font-medium text-gray-700 uppercase tracking-wider">Date</th>
              <th className="px-4 py-2 text-left text-[10px] font-medium text-gray-700 uppercase tracking-wider">Start</th>
              <th className="px-4 py-2 text-left text-[10px] font-medium text-gray-700 uppercase tracking-wider">End</th>
              <th className="px-4 py-2 text-left text-[10px] font-medium text-gray-700 uppercase tracking-wider">Hours</th>
              <th className="px-4 py-2 text-left text-[10px] font-medium text-gray-700 uppercase tracking-wider">OT</th>
              <th className="px-4 py-2 text-left text-[10px] font-medium text-gray-700 uppercase tracking-wider">Location</th>
              {canEdit && <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-700 uppercase tracking-wider"></th>}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 7 : 6} className="px-4 py-8 text-center text-xs text-gray-400 italic">
                  No check-in history yet
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.dateKey} className="hover:bg-gray-50">
                  <td className="px-4 py-2 whitespace-nowrap text-xs font-medium text-gray-900">
                    {formatThaiDateLong(row.dateKey)}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-700">
                    {row.startTime ? formatThaiTime(row.startTime) : "-"}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-700">
                    {row.stillWorking ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-semibold">
                        Still working
                      </span>
                    ) : row.endTime ? (
                      formatThaiTime(row.endTime)
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-700">
                    {row.totalHours > 0 ? `${formatHoursTenths(row.totalHours)} ชม.` : "-"}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-xs">
                    {row.otHours > 0 ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[10px] font-semibold">
                        +{formatHoursTenths(row.otHours)} ชม.
                      </span>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                      row.location === "OUTSIDE" ? "bg-yellow-100 text-yellow-800" : "bg-blue-100 text-blue-700"
                    }`}>
                      <MapPin className="w-2.5 h-2.5 mr-1" />
                      {row.location === "OUTSIDE" ? "Outside" : "Onsite"}
                    </span>
                  </td>
                  {canEdit && (
                    <td className="px-4 py-2 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(row.dateKey)}
                          disabled={loadingDateKey === row.dateKey}
                          title="แก้ไข"
                          className="flex items-center justify-center w-6 h-6 rounded-full text-gray-400 hover:text-orange-600 hover:bg-orange-50 transition-colors disabled:opacity-50"
                        >
                          {loadingDateKey === row.dateKey ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Pencil className="w-3 h-3" />
                          )}
                        </button>
                        <button
                          onClick={() => handleDelete(row.dateKey)}
                          title="ลบ"
                          className="flex items-center justify-center w-6 h-6 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modal && modalDateKey && (
        <DayAttendanceModal
          dateKey={modalDateKey}
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
          onClose={() => {
            setModal(null);
            setEditingRow(null);
            setModalDateKey(null);
          }}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}
