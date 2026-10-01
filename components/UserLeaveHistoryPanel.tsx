"use client";

import { useState } from "react";
import { CalendarOff, Trash2 } from "lucide-react";
import { cancelLeaveRequest } from "@/app/actions/leave";
import { leaveTypeLabel } from "@/lib/leaveTypes";
import { formatThaiDate } from "@/lib/datetime";

interface LeaveRow {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: string;
}

const statusLabel: Record<string, string> = {
  PENDING: "รออนุมัติ",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ถูกปฏิเสธ",
  CANCELLED: "ยกเลิกแล้ว",
};
const statusClass: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};

export default function UserLeaveHistoryPanel({ initialLeaves, canEdit }: { initialLeaves: LeaveRow[]; canEdit: boolean }) {
  const [leaves, setLeaves] = useState(initialLeaves);

  const handleCancel = async (leave: LeaveRow) => {
    if (!confirm(`ยกเลิกใบลา${leaveTypeLabel[leave.type] || leave.type}นี้?`)) return;
    const result = await cancelLeaveRequest(leave.id);
    if (!result.success) {
      alert(result.error || "ยกเลิกไม่สำเร็จ");
      return;
    }
    setLeaves((prev) => prev.map((l) => (l.id === leave.id ? { ...l, status: "CANCELLED" } : l)));
  };

  return (
    <div className="bg-white shadow-sm rounded-3xl border border-gray-100 p-6">
      <h2 className="text-sm font-bold text-gray-900 flex items-center mb-4">
        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-rose-50 mr-2">
          <CalendarOff className="h-4 w-4 text-rose-600" />
        </span>
        ประวัติการลา
      </h2>
      {leaves.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-6 bg-gray-50 rounded-2xl">ไม่มีประวัติการลา</p>
      ) : (
        <ul className="space-y-2">
          {leaves.map((l) => (
            <li key={l.id} className="rounded-2xl border border-gray-100 p-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-semibold text-gray-900">{leaveTypeLabel[l.type] || l.type}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${statusClass[l.status] || "bg-gray-100 text-gray-500"}`}>
                    {statusLabel[l.status] || l.status}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {l.startDate === l.endDate ? formatThaiDate(l.startDate) : `${formatThaiDate(l.startDate)} – ${formatThaiDate(l.endDate)}`}
                </p>
                {l.reason && <p className="text-xs text-gray-400 mt-0.5 italic">{l.reason}</p>}
              </div>
              {canEdit && (l.status === "PENDING" || l.status === "APPROVED") && (
                <button
                  onClick={() => handleCancel(l)}
                  title="ยกเลิกการลา"
                  className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
