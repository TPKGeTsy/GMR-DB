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
  editing?: { userId: string; hours: number; otHours: number; wentOutside: boolean };
}

export default function DayAttendanceModal({ dateKey, employeeOptions, onClose, onSaved, editing }: DayAttendanceModalProps) {
  const [userId, setUserId] = useState(editing?.userId || employeeOptions[0]?.id || "");
  const [hours, setHours] = useState(String(editing?.hours ?? 8));
  const [otHours, setOtHours] = useState(String(editing?.otHours ?? 0));
  const [wentOutside, setWentOutside] = useState(editing?.wentOutside ?? false);
  const [outsideNote, setOutsideNote] = useState("");
  const [outsideStartTime, setOutsideStartTime] = useState("09:00");
  const [outsideEndTime, setOutsideEndTime] = useState("17:00");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const payload = {
      userId,
      dateKey,
      hours: Number(hours) || 0,
      otHours: Number(otHours) || 0,
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
            {editing ? "แก้ไขชั่วโมงทำงานวันนี้" : "เพิ่มรายการเข้างาน (ลืมเช็คอิน)"}
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

          {!wentOutside && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400">ชั่วโมงทำงาน</label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                    required
                    className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400">ชั่วโมง OT</label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={otHours}
                    onChange={(e) => setOtHours(e.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
                  />
                </div>
              </div>
              <p className="text-[10px] text-gray-400">
                ไม่ต้องระบุเวลาเข้า-ออก ระบุแค่จำนวนชั่วโมงรวมที่ทำงานวันนี้ก็พอ
              </p>
            </>
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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400">เวลาออก</label>
                    <input
                      type="time"
                      value={outsideStartTime}
                      onChange={(e) => setOutsideStartTime(e.target.value)}
                      required
                      className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">เวลากลับ</label>
                    <input
                      type="time"
                      value={outsideEndTime}
                      onChange={(e) => setOutsideEndTime(e.target.value)}
                      required
                      className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-gray-400">
                  ถ้ากลับหลังเที่ยงคืน ระบบจะเลื่อนเวลากลับไปเป็นวันถัดไปให้อัตโนมัติ
                </p>
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
