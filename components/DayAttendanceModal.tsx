"use client";

import { useState } from "react";
import {
  addManualAttendanceDay,
  addManualOutsideTripDay,
  editManualAttendanceDay,
  type EmployeeOption,
} from "@/app/actions/checkin";
import { X } from "lucide-react";

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
  const [userId, setUserId] = useState(editing?.userId || employeeOptions[0]?.id || "");
  // Only used when adding a fresh outside-trip day for a whole team —
  // editing always targets the one employee whose row was clicked.
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(editing ? [editing.userId] : []);
  const [startTime, setStartTime] = useState(editing?.startTime || "09:00");
  const [endTime, setEndTime] = useState(editing?.endTime || "17:00");
  const [wentOutside, setWentOutside] = useState(editing?.wentOutside ?? false);
  const [outsideNote, setOutsideNote] = useState("");
  const [workSummary, setWorkSummary] = useState("");
  const [outsideStartTime, setOutsideStartTime] = useState(
    editing?.outsideStartTime || editing?.startTime || "10:00"
  );
  const [outsideEndTime, setOutsideEndTime] = useState(editing?.outsideEndTime || editing?.endTime || "16:00");
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

    const result = isTeamOutsideAdd
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">
            {editing ? "แก้ไขเวลาทำงานวันนี้" : "เพิ่มรายการเข้างาน (ลืมเช็คอิน)"}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-3">
          {isTeamOutsideAdd ? (
            <div>
              <label className="text-xs text-gray-400">ผู้ปฏิบัติงาน (เลือกได้หลายคน)</label>
              <div className="mt-1 max-h-32 overflow-y-auto border border-gray-300 rounded-md divide-y divide-gray-100">
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
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none disabled:bg-gray-50 disabled:text-gray-500"
              >
                {employeeOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={wentOutside}
                onChange={(e) => setWentOutside(e.target.checked)}
                className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
              />
              วันนี้ออกหน้างานหรือไม่
            </label>
          </div>

          {wentOutside ? (
            <div className="space-y-2 rounded-md border border-orange-100 bg-orange-50/40 p-2.5">
              <div>
                <label className="text-xs text-gray-400">สถานที่</label>
                <input
                  type="text"
                  value={outsideNote}
                  onChange={(e) => setOutsideNote(e.target.value)}
                  placeholder="เช่น ไซต์งาน ABC"
                  required
                  className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400">สรุปงานคร่าวๆ (ไปทำอะไร)</label>
                <input
                  type="text"
                  value={workSummary}
                  onChange={(e) => setWorkSummary(e.target.value)}
                  placeholder="เช่น ติดตั้งอุปกรณ์, ซ่อมบำรุง"
                  className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
                />
              </div>
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
                      className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400">ถึงหน้างาน</label>
                    <input
                      type="time"
                      value={outsideStartTime}
                      onChange={(e) => setOutsideStartTime(e.target.value)}
                      required
                      className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400">ออกจากหน้างาน</label>
                    <input
                      type="time"
                      value={outsideEndTime}
                      onChange={(e) => setOutsideEndTime(e.target.value)}
                      required
                      className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400">ถึง บ.</label>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      required
                      className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-gray-400 mt-1">
                  ถ้าเวลาถึง บ. ข้ามเที่ยงคืน ระบบจะเลื่อนเป็นวันถัดไปให้อัตโนมัติ
                </p>
              </div>
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
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
                />
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  required
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
                />
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                ถ้าเลิกงานหลังเที่ยงคืน ระบบจะเลื่อนเวลาออกไปเป็นวันถัดไปให้อัตโนมัติ
              </p>
            </div>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3 py-1.5 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={isSubmitting || (isTeamOutsideAdd && selectedUserIds.length === 0)}
              className="px-3 py-1.5 rounded-md bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 disabled:opacity-50"
            >
              {isSubmitting ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
