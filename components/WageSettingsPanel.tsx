"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateWageSettings } from "@/app/actions/wages";
import type { WageSettingsValues } from "@/lib/wages";
import { Settings } from "lucide-react";

const FIELDS: { key: keyof WageSettingsValues; label: string; hint: string }[] = [
  { key: "gradeARate", label: "เกรด A (ในออฟฟิศ)", hint: "บาท/วัน" },
  { key: "gradeBRate", label: "เกรด B (ในออฟฟิศ)", hint: "บาท/วัน" },
  { key: "gradeCRate", label: "เกรด C (ในออฟฟิศ)", hint: "บาท/วัน" },
  { key: "outsideFlatRate", label: "เกรด B/C (ออกข้างนอก)", hint: "บาท/วัน เหมาจ่าย" },
  { key: "gradeAOutsideAllowance", label: "เบี้ยเลี้ยงเกรด A (ออกข้างนอก)", hint: "บาท/วัน เพิ่มจากเรทปกติ" },
];

export default function WageSettingsPanel({ initial }: { initial: WageSettingsValues }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<keyof WageSettingsValues, string>>(
    Object.fromEntries(FIELDS.map((f) => [f.key, String(initial[f.key])])) as Record<keyof WageSettingsValues, string>
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSaved(false);

    const parsed = Object.fromEntries(
      FIELDS.map((f) => [f.key, Number(values[f.key]) || 0])
    ) as unknown as WageSettingsValues;

    const result = await updateWageSettings(parsed);
    if (!result.success) {
      setError(result.error || "บันทึกไม่สำเร็จ");
    } else {
      setSaved(true);
      router.refresh();
    }
    setIsSubmitting(false);
  };

  return (
    <div className="bg-white shadow rounded-lg border border-gray-100 p-6">
      <h2 className="text-sm font-semibold text-gray-900 flex items-center mb-4">
        <Settings className="h-4 w-4 text-orange-600 mr-2" />
        ตั้งค่าอัตราค่าแรงรายวัน
      </h2>
      <form onSubmit={handleSave} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label className="text-xs text-gray-500">{f.label}</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min={0}
                value={values[f.key]}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                className="w-28 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
              />
              <span className="text-[11px] text-gray-400">{f.hint}</span>
            </div>
          </div>
        ))}
        <div className="sm:col-span-2 flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-1.5 rounded-md bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 disabled:opacity-50"
          >
            {isSubmitting ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
          </button>
          {saved && <span className="text-xs text-green-600">บันทึกแล้ว</span>}
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      </form>
    </div>
  );
}
