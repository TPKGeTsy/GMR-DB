"use client";

import { useState } from "react";
import { updateOutsideTripReport } from "@/app/actions/outsideTrip";
import { Check } from "lucide-react";

export default function TripReportEditor({ tripId, initialReport }: { tripId: string; initialReport: string | null }) {
  const [report, setReport] = useState(initialReport || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    const result = await updateOutsideTripReport(tripId, report);
    setSaving(false);
    if (!result.success) {
      setError(result.error || "บันทึกไม่สำเร็จ");
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-2">
      <textarea
        value={report}
        onChange={(e) => setReport(e.target.value)}
        rows={5}
        placeholder="รายละเอียดเพิ่มเติม เช่น ถึงหน้างานกี่โมง งานที่ทำ ปัญหาที่เจอ ฯลฯ"
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 disabled:opacity-50"
        >
          {saving ? "กำลังบันทึก..." : "บันทึกหมายเหตุ"}
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
            <Check className="w-3.5 h-3.5" />
            บันทึกแล้ว
          </span>
        )}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  );
}
