"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startOutsideWorkTrip, type OutsideTripEmployeeOption } from "@/app/actions/outsideTrip";
import { MapPin, Users, Send } from "lucide-react";

export default function StartOutsideTripForm({
  employeeOptions,
  currentUserId,
}: {
  employeeOptions: OutsideTripEmployeeOption[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [location, setLocation] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set([currentUserId]));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const toggle = (id: string) => {
    if (id === currentUserId) return; // requester is always included
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(false);

    const result = await startOutsideWorkTrip(location, Array.from(selectedIds));

    if (!result.success) {
      setError(result.error || "บันทึกไม่สำเร็จ");
      setIsSubmitting(false);
      return;
    }

    setSuccess(true);
    setLocation("");
    setSelectedIds(new Set([currentUserId]));
    setIsSubmitting(false);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg border border-gray-100 p-6 space-y-5 max-w-2xl">
      <div>
        <label htmlFor="location" className="block text-sm font-medium text-gray-900 flex items-center mb-1">
          <MapPin className="w-4 h-4 mr-1.5 text-orange-600" />
          สถานที่
        </label>
        <input
          id="location"
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="เช่น ไซต์งาน ABC"
          required
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-900 flex items-center mb-2">
          <Users className="w-4 h-4 mr-1.5 text-orange-600" />
          สมาชิกที่ไปด้วย
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto border border-gray-100 rounded-md p-3">
          {employeeOptions.map((emp) => {
            const isSelf = emp.id === currentUserId;
            const isChecked = selectedIds.has(emp.id);
            return (
              <label
                key={emp.id}
                className={`flex items-center gap-2 text-sm px-2 py-1.5 rounded-md cursor-pointer ${
                  isChecked ? "bg-orange-50 text-orange-700" : "text-gray-700 hover:bg-gray-50"
                } ${isSelf ? "opacity-80 cursor-default" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  disabled={isSelf}
                  onChange={() => toggle(emp.id)}
                  className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                />
                {emp.name}
                {isSelf && <span className="text-[10px] text-gray-400">(คุณ)</span>}
              </label>
            );
          })}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">บันทึกออกหน้างานเรียบร้อยแล้ว</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 disabled:opacity-50"
      >
        <Send className="w-4 h-4" />
        {isSubmitting ? "กำลังบันทึก..." : "เปิดออกหน้างาน"}
      </button>
    </form>
  );
}
