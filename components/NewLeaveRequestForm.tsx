"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createLeaveRequest } from "@/app/actions/leave";
import { CalendarPlus } from "lucide-react";

const LEAVE_TYPE_OPTIONS = [
  { value: "SICK", label: "ลาป่วย" },
  { value: "PERSONAL", label: "ลากิจ" },
  { value: "VACATION", label: "ลาพักร้อน" },
];

export default function NewLeaveRequestForm() {
  const router = useRouter();
  const [type, setType] = useState("SICK");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!startDate || !endDate) {
      setMessage("กรุณาเลือกวันที่เริ่มต้นและสิ้นสุด");
      return;
    }
    setIsSubmitting(true);
    setMessage(null);
    const result = await createLeaveRequest(type, startDate, endDate, reason);
    if (result.success) {
      setStartDate("");
      setEndDate("");
      setReason("");
      setType("SICK");
      router.refresh();
    } else {
      setMessage(result.error || "ยื่นใบลาไม่สำเร็จ");
    }
    setIsSubmitting(false);
  };

  return (
    <div className="bg-white shadow rounded-lg border border-gray-100 p-5 space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">ประเภทการลา</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="w-full rounded-md border-gray-300 text-sm focus:border-orange-500 focus:ring-orange-500"
        >
          {LEAVE_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">วันที่เริ่มลา</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-md border-gray-300 text-sm focus:border-orange-500 focus:ring-orange-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">วันที่สิ้นสุด</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full rounded-md border-gray-300 text-sm focus:border-orange-500 focus:ring-orange-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">เหตุผล (ไม่บังคับ)</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="รายละเอียดเพิ่มเติม เช่น อาการป่วย หรือธุระที่ต้องไปทำ"
          className="w-full rounded-md border-gray-300 text-sm focus:border-orange-500 focus:ring-orange-500"
        />
      </div>

      {message && <p className="text-xs text-red-600">{message}</p>}

      <button
        onClick={handleSubmit}
        disabled={isSubmitting}
        className="inline-flex items-center justify-center w-full sm:w-auto px-5 py-2.5 rounded-md text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 font-semibold text-sm"
      >
        <CalendarPlus className="w-4 h-4 mr-2" />
        {isSubmitting ? "กำลังส่ง..." : "ยื่นใบลา"}
      </button>
    </div>
  );
}
