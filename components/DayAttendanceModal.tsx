"use client";

import { useState } from "react";
import {
  addManualAttendanceDay,
  addManualOutsideTripDay,
  editManualAttendanceDay,
  type EmployeeOption,
} from "@/app/actions/checkin";
import { addManualLeaveDay } from "@/app/actions/leave";
import { leaveTypeLabel } from "@/lib/leaveTypes";
import { X } from "lucide-react";

const LEAVE_TYPE_OPTIONS = Object.entries(leaveTypeLabel) as [string, string][];

interface DayAttendanceModalProps {
  dateKey: string;
  employeeOptions: EmployeeOption[];
  onClose: () => void;
  onSaved: () => void;
  /** Present when editing an existing row — prefills the form and switches
   *  the submit action to the replace-the-day edit path (always one
   *  employee at a time, unlike a fresh outside-trip add). */
  editing?: {
    userId: string;
    startTime: string;
    endTime: string;
    wentOutside: boolean;
    outsideStartTime?: string;
    outsideEndTime?: string;
  };
}

export default function DayAttendanceModal({ dateKey, employeeOptions, onClose, onSaved, editing }: DayAttendanceModalProps) {
  // Editing only ever targets an existing attendance row — the leave mode
  // is add-only (cancel an existing leave day from its own card instead).
  const [entryMode, setEntryMode] = useState<"attendance" | "leave">("attendance");
  const [userId, setUserId] = useState(editing?.userId || employeeOptions[0]?.id || "");
  // Only used when adding a fresh outside-trip day for a whole team —
  // editing always targets the one employee whose row was clicked.
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(editing ? [editing.userId] : []);
  const [startTime, setStartTime] = useState(editing?.startTime || "09:00");
  const [endTime, setEndTime] = useState(editing?.endTime || "17:00");
  const [wentOutside, setWentOutside] = useState(editing?.wentOutside ?? false);
  // "ไปทั้งวัน": the 4-field travel-report form (depart office -> site ->
  // depart site -> back). "ไปแค่บางช่วง": someone who mostly worked a normal
  // office day and just stepped out for part of it — same underlying 4
  // values (outsideStartTime/outsideEndTime nest inside startTime/endTime
  // either way), only the framing/labels and defaults change.
  const [outsideAllDay, setOutsideAllDay] = useState(true);
  const [outsideNote, setOutsideNote] = useState("");
  const [workSummary, setWorkSummary] = useState("");
  const [outsideStartTime, setOutsideStartTime] = useState(
    editing?.outsideStartTime || editing?.startTime || "10:00"
  );
  const [outsideEndTime, setOutsideEndTime] = useState(editing?.outsideEndTime || editing?.endTime || "16:00");
  const [leaveType, setLeaveType] = useState<string>(LEAVE_TYPE_OPTIONS[0]?.[0] || "PERSONAL");
  const [leaveReason, setLeaveReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isTeamOutsideAdd = !editing && wentOutside;

  const toggleSelectedUser = (id: string) => {
    setSelectedUserIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const result = entryMode === "leave"
      ? await addManualLeaveDay({ userId, dateKey, type: leaveType, reason: leaveReason })
      : isTeamOutsideAdd
      ? await addManualOutsideTripDay({
          userIds: selectedUserIds,
          dateKey,
          startTime,
          endTime,
          outsideNote,
          outsideStartTime,
          outsideEndTime,
          workSummary,
        })
      : editing
      ? await editManualAttendanceDay({
          userId,
          dateKey,
          startTime,
          endTime,
          wentOutside,
          outsideNote,
          outsideStartTime,
          outsideEndTime,
          workSummary,
        })
      : await addManualAttendanceDay({
          userId,
          dateKey,
          startTime,
          endTime,
          wentOutside,
          outsideNote,
          outsideStartTime,
          outsideEndTime,
          workSummary,
        });

    if (!result.success) {
      setError(result.error || "บันทึกไม่สำเร็จ");
      setIsSubmitting(false);
      return;
    }

    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-xl w-full max-w-sm p-5 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="mx-auto sm:hidden w-10 h-1 rounded-full bg-gray-200 -mt-1 mb-1" />
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900">
            {editing ? "แก้ไขเวลาทำงานวันนี้" : entryMode === "leave" ? "เพิ่มรายการลา" : "เพิ่มรายการเข้างาน (ลืมเช็คอิน)"}
          </h3>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!editing && (
          <div className="grid grid-cols-2 gap-1 rounded-full bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setEntryMode("attendance")}
              className={`rounded-full py-1.5 text-sm font-semibold transition-colors ${
                entryMode === "attendance" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
              }`}
            >
              เข้างาน
            </button>
            <button
              type="button"
              onClick={() => setEntryMode("leave")}
              className={`rounded-full py-1.5 text-sm font-semibold transition-colors ${
                entryMode === "leave" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
              }`}
            >
              ลา
            </button>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-3">
          {isTeamOutsideAdd && entryMode === "attendance" ? (
            <div>
              <label className="text-xs text-gray-400">ผู้ปฏิบัติงาน (เลือกได้หลายคน)</label>
              <div className="mt-1 max-h-32 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100">
                {employeeOptions.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedUserIds.includes(u.id)}
                      onChange={() => toggleSelectedUser(u.id)}
                      className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                    />
                    {u.name}
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <label className="text-xs text-gray-400">พนักงาน</label>
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                disabled={!!editing}
                className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white outline-none disabled:bg-gray-100 disabled:text-gray-500 transition-colors"
              >
                {employeeOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {entryMode === "leave" ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400">ประเภทการลา</label>
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white outline-none transition-colors"
                >
                  {LEAVE_TYPE_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400">หมายเหตุ</label>
                <textarea
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  placeholder="เช่น ลาป่วยไข้หวัด, ลากิจธุระส่วนตัว"
                  rows={2}
                  className="mt-0.5 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white outline-none transition-colors resize-none"
                />
              </div>
            </div>
          ) : (
          <>
          <label className="flex items-center justify-between gap-2 text-sm font-medium text-gray-700 rounded-xl bg-gray-50 px-3 py-2.5 cursor-pointer">
            วันนี้ออกหน้างานหรือไม่
            <span className="relative inline-flex flex-shrink-0">
              <input
                type="checkbox"
                checked={wentOutside}
                onChange={(e) => setWentOutside(e.target.checked)}
                className="sr-only peer"
              />
              <span className="w-10 h-6 rounded-full bg-gray-300 peer-checked:bg-orange-600 transition-colors" />
              <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
            </span>
          </label>

          {wentOutside ? (
            <div className="space-y-2.5 rounded-2xl border border-orange-100 bg-orange-50/40 p-3">
              <div className="grid grid-cols-2 gap-1 rounded-full bg-white border border-orange-100 p-1">
                <button
                  type="button"
                  onClick={() => setOutsideAllDay(true)}
                  className={`rounded-full py-1 text-xs font-semibold transition-colors ${
                    outsideAllDay ? "bg-orange-600 text-white" : "text-gray-500"
                  }`}
                >
                  ไปทั้งวัน
                </button>
                <button
                  type="button"
                  onClick={() => setOutsideAllDay(false)}
                  className={`rounded-full py-1 text-xs font-semibold transition-colors ${
                    !outsideAllDay ? "bg-orange-600 text-white" : "text-gray-500"
                  }`}
                >
                  ไปแค่บางช่วง
                </button>
              </div>
              <div>
                <label className="text-xs text-gray-400">สถานที่</label>
                <input
                  type="text"
                  value={outsideNote}
                  onChange={(e) => setOutsideNote(e.target.value)}
                  placeholder="เช่น ไซต์งาน ABC"
                  required
                  className="mt-0.5 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white outline-none transition-colors"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400">สรุปงานคร่าวๆ (ไปทำอะไร)</label>
                <input
                  type="text"
                  value={workSummary}
                  onChange={(e) => setWorkSummary(e.target.value)}
                  placeholder="เช่น ติดตั้งอุปกรณ์, ซ่อมบำรุง"
                  className="mt-0.5 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white outline-none transition-colors"
                />
              </div>
              {outsideAllDay ? (
                <div>
                  <p className="text-xs text-gray-400 mb-1">เวลาเดินทาง (โดยประมาณ)</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-400">ออกจาก บ.</label>
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        required
                        className="mt-0.5 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white outline-none transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400">ถึงหน้างาน</label>
                      <input
                        type="time"
                        value={outsideStartTime}
                        onChange={(e) => setOutsideStartTime(e.target.value)}
                        required
                        className="mt-0.5 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white outline-none transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400">ออกจากหน้างาน</label>
                      <input
                        type="time"
                        value={outsideEndTime}
                        onChange={(e) => setOutsideEndTime(e.target.value)}
                        required
                        className="mt-0.5 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white outline-none transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400">ถึง บ.</label>
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        required
                        className="mt-0.5 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white outline-none transition-colors"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">
                    ถ้าเวลาถึง บ. ข้ามเที่ยงคืน ระบบจะเลื่อนเป็นวันถัดไปให้อัตโนมัติ
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-xs text-gray-400 mb-1">ช่วงเวลาทำงานปกติ + ช่วงที่ออกไป</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-400">เข้างาน</label>
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        required
                        className="mt-0.5 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white outline-none transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400">เลิกงาน</label>
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        required
                        className="mt-0.5 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white outline-none transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400">ออกจากออฟฟิศ (ช่วง)</label>
                      <input
                        type="time"
                        value={outsideStartTime}
                        onChange={(e) => setOutsideStartTime(e.target.value)}
                        required
                        className="mt-0.5 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white outline-none transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400">กลับถึงออฟฟิศ</label>
                      <input
                        type="time"
                        value={outsideEndTime}
                        onChange={(e) => setOutsideEndTime(e.target.value)}
                        required
                        className="mt-0.5 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white outline-none transition-colors"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="text-xs text-gray-400">ทำงานกี่โมงถึงกี่โมง</label>
              <div className="grid grid-cols-2 gap-3 mt-1">
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white outline-none transition-colors"
                />
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  required
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white outline-none transition-colors"
                />
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                ถ้าเลิกงานหลังเที่ยงคืน ระบบจะเลื่อนเวลาออกไปเป็นวันถัดไปให้อัตโนมัติ
              </p>
            </div>
          )}
          </>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-full border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50 transition-colors"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={isSubmitting || (entryMode === "attendance" && isTeamOutsideAdd && selectedUserIds.length === 0)}
              className="px-5 py-2.5 rounded-full bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 active:bg-orange-800 shadow-sm shadow-orange-200 disabled:opacity-50 disabled:shadow-none transition-colors"
            >
              {isSubmitting ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
