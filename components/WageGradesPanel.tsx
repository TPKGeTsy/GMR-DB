"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createWageGrade, updateWageGrade, deleteWageGrade, type WageGradeRow } from "@/app/actions/wages";
import { gradeBadgeClass } from "@/lib/gradeColor";
import { Settings, Plus, Trash2, Check } from "lucide-react";

function GradeRow({ grade, onChanged }: { grade: WageGradeRow; onChanged: () => void }) {
  const [onsiteRate, setOnsiteRate] = useState(String(grade.onsiteRate));
  const [outsideRate, setOutsideRate] = useState(String(grade.outsideRate));
  const [isDirty, setIsDirty] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setIsSubmitting(true);
    setError(null);
    const result = await updateWageGrade(grade.id, {
      onsiteRate: Number(onsiteRate) || 0,
      outsideRate: Number(outsideRate) || 0,
    });
    if (!result.success) {
      setError(result.error || "บันทึกไม่สำเร็จ");
    } else {
      setIsDirty(false);
      onChanged();
    }
    setIsSubmitting(false);
  };

  const handleDelete = async () => {
    if (!confirm(`ลบเกรด "${grade.code}" ถาวร?`)) return;
    setIsSubmitting(true);
    const result = await deleteWageGrade(grade.id);
    if (!result.success) {
      alert(result.error || "ลบไม่สำเร็จ");
      setIsSubmitting(false);
      return;
    }
    onChanged();
  };

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-2">
        <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${gradeBadgeClass(grade.code)}`}>
          {grade.code}
        </span>
      </td>
      <td className="px-4 py-2">
        <input
          type="number"
          min={0}
          value={onsiteRate}
          onChange={(e) => {
            setOnsiteRate(e.target.value);
            setIsDirty(true);
          }}
          className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
        />
      </td>
      <td className="px-4 py-2">
        <input
          type="number"
          min={0}
          value={outsideRate}
          onChange={(e) => {
            setOutsideRate(e.target.value);
            setIsDirty(true);
          }}
          className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
        />
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          {isDirty && (
            <button
              onClick={handleSave}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1 text-xs text-green-600 hover:text-green-700 disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              บันทึก
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={isSubmitting}
            className="text-gray-400 hover:text-red-600 disabled:opacity-50"
            title="ลบเกรดนี้"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        {error && <p className="text-[10px] text-red-600 mt-0.5">{error}</p>}
      </td>
    </tr>
  );
}

export default function WageGradesPanel({ initial }: { initial: WageGradeRow[] }) {
  const router = useRouter();
  const [newCode, setNewCode] = useState("");
  const [newOnsite, setNewOnsite] = useState("300");
  const [newOutside, setNewOutside] = useState("300");
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const refresh = () => router.refresh();

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAdding(true);
    setAddError(null);

    const result = await createWageGrade({
      code: newCode.trim(),
      onsiteRate: Number(newOnsite) || 0,
      outsideRate: Number(newOutside) || 0,
    });

    if (!result.success) {
      setAddError(result.error || "เพิ่มเกรดไม่สำเร็จ");
    } else {
      setNewCode("");
      setNewOnsite("300");
      setNewOutside("300");
      refresh();
    }
    setIsAdding(false);
  };

  return (
    <div className="bg-white shadow rounded-lg border border-gray-100 overflow-hidden">
      <div className="p-6 pb-4">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center mb-1">
          <Settings className="h-4 w-4 text-orange-600 mr-2" />
          เกรดและอัตราค่าแรงรายวัน
        </h2>
        <p className="text-xs text-gray-400">
          เพิ่มเกรดใหม่ได้ตามต้องการ (เช่น A+, S) แต่ละเกรดตั้งอัตราในออฟฟิศ/ออกข้างนอกแยกกันได้อิสระ
        </p>
      </div>
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left text-[10px] font-medium text-gray-700 uppercase tracking-wider">เกรด</th>
            <th className="px-4 py-2 text-left text-[10px] font-medium text-gray-700 uppercase tracking-wider">ในออฟฟิศ (บาท/วัน)</th>
            <th className="px-4 py-2 text-left text-[10px] font-medium text-gray-700 uppercase tracking-wider">ออกข้างนอก (บาท/วัน)</th>
            <th className="px-4 py-2 text-left text-[10px] font-medium text-gray-700 uppercase tracking-wider" />
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {initial.map((grade) => (
            <GradeRow key={grade.id} grade={grade} onChanged={refresh} />
          ))}
        </tbody>
      </table>
      <form onSubmit={handleAdd} className="p-4 border-t border-gray-100 bg-gray-50/50 flex flex-wrap items-end gap-2">
        <div>
          <label className="text-[10px] text-gray-500">เกรดใหม่</label>
          <input
            type="text"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            placeholder="เช่น S"
            maxLength={10}
            required
            className="mt-0.5 block w-24 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-500">ในออฟฟิศ</label>
          <input
            type="number"
            min={0}
            value={newOnsite}
            onChange={(e) => setNewOnsite(e.target.value)}
            className="mt-0.5 block w-24 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-500">ออกข้างนอก</label>
          <input
            type="number"
            min={0}
            value={newOutside}
            onChange={(e) => setNewOutside(e.target.value)}
            className="mt-0.5 block w-24 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={isAdding}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" />
          เพิ่มเกรด
        </button>
        {addError && <p className="text-xs text-red-600">{addError}</p>}
      </form>
    </div>
  );
}
