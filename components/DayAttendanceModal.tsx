"use client";

import { useState } from "react";
import {
  addManualAttendanceDay,
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
   *  the submit action to the replace-the-day edit path. */
  editing?: { userId: string; startTime: string; endTime: string; wentOutside: boolean };
}

export default function DayAttendanceModal({ dateKey, employeeOptions, onClose, onSaved, editing }: DayAttendanceModalProps) {
  const [userId, setUserId] = useState(editing?.userId || employeeOptions[0]?.id || "");
  const [startTime, setStartTime] = useState(editing?.startTime || "09:00");
  const [endTime, setEndTime] = useState(editing?.endTime || "17:00");
  const [wentOutside, setWentOutside] = useState(editing?.wentOutside ?? false);
  const [outsideNote, setOutsideNote] = useState("");
  const [outsideStartTime, setOutsideStartTime] = useState(editing?.startTime || "09:00");
  const [outsideEndTime, setOutsideEndTime] = useState(editing?.endTime || "17:00");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const payload = {
      userId,
      dateKey,
      startTime,
      endTime,
      wentOutside,
      outsideNote,
      outsideStartTime,
      outsideEndTime,
    };
    const result = editing ? await editManualAttendanceDay(payload) : await addManualAttendanceDay(payload);

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
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">
            {editing ? "แก้ไขเวลาทำงานวันนี้" : "เพิ่มรายการเข้างาน (ลืมเช็คอิน)"}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-3">
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
            {wentOutside && (
              <div className="mt-1.5 space-y-2">
                <input
                  type="text"
                  value={outsideNote}
                  onChange={(e) => setOutsideNote(e.target.value)}
                  placeholder="ไปที่ไหน เช่น ไซต์งาน ABC"
                  required
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
                />
                <div>
                  <label className="text-xs text-gray-400">ออกหน้างานช่วงเวลาไหน (ในวันทำงานนี้)</label>
                  <div className="grid grid-cols-2 gap-3 mt-1">
                    <div>
                      <label className="text-[10px] text-gray-400">เวลาออก</label>
                      <input
                        type="time"
                        value={outsideStartTime}
                        onChange={(e) => setOutsideStartTime(e.target.value)}
                        required
                        className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400">เวลากลับ</label>
                      <input
                        type="time"
                        value={outsideEndTime}
                        onChange={(e) => setOutsideEndTime(e.target.value)}
                        required
                        className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

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
              disabled={isSubmitting}
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
