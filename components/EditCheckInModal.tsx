"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateCheckIn, deleteCheckIn, type AttendanceTableRow, type EmployeeOption } from "@/app/actions/checkin";
import { X, Trash2 } from "lucide-react";

// Bangkok has a fixed +07:00 offset (no DST) — same trick used server-side
// (lib/datetime.ts's bangkokDateAt/bangkokDayRange) to convert between a
// <input type="datetime-local"> value (always naively "local", but the app
// wants that to mean Bangkok time, not the admin's own browser timezone)
// and a real UTC instant, without pulling in a timezone library for it.
function toBangkokInputValue(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function fromBangkokInputValue(value: string): string {
  return new Date(`${value}:00+07:00`).toISOString();
}

export default function EditCheckInModal({
  row,
  employeeOptions,
  onClose,
}: {
  row: AttendanceTableRow;
  employeeOptions: EmployeeOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [userId, setUserId] = useState(row.employeeId);
  const [type, setType] = useState(row.type);
  const [location, setLocation] = useState(row.location);
  const [time, setTime] = useState(toBangkokInputValue(row.time));
  const [note, setNote] = useState(row.note || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const result = await updateCheckIn(row.id, {
      userId,
      type,
      location,
      createdAt: fromBangkokInputValue(time),
      note,
    });

    if (!result.success) {
      setError(result.error || "แก้ไขไม่สำเร็จ");
      setIsSubmitting(false);
      return;
    }

    router.refresh();
    onClose();
  };

  const handleDelete = async () => {
    if (!confirm(`ลบรายการ "${row.employeeName}" (${row.type === "IN" ? "เข้างาน" : "เลิกงาน"}) นี้ถาวร?`)) return;
    setIsSubmitting(true);
    const result = await deleteCheckIn(row.id);
    if (!result.success) {
      setError(result.error || "ลบไม่สำเร็จ");
      setIsSubmitting(false);
      return;
    }
    router.refresh();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">แก้ไขรายการเช็คอิน/เอาท์</h3>
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
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
            >
              {employeeOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400">ประเภท</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
              >
                <option value="IN">เข้างาน</option>
                <option value="OUT">เลิกงาน</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400">สถานที่</label>
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
              >
                <option value="OFFICE">ออฟฟิศ</option>
                <option value="OUTSIDE">นอกออฟฟิศ</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400">วันเวลา (เวลาไทย)</label>
            <input
              type="datetime-local"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400">หมายเหตุ</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={handleDelete}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              ลบรายการนี้
            </button>
            <div className="flex items-center gap-2">
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
          </div>
        </form>
      </div>
    </div>
  );
}
