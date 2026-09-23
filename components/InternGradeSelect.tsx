"use client";

import { updateUserInternGrade } from "@/app/actions/wages";
import { useState } from "react";

interface InternGradeSelectProps {
  userId: string;
  initialGrade: string | null;
  readOnly?: boolean;
}

const GRADE_BADGE_STYLES: Record<string, string> = {
  A: "bg-emerald-100 text-emerald-700",
  B: "bg-amber-100 text-amber-700",
  C: "bg-rose-100 text-rose-700",
};

export default function InternGradeSelect({ userId, initialGrade, readOnly = false }: InternGradeSelectProps) {
  const [grade, setGrade] = useState(initialGrade || "");
  const [isPending, setIsPending] = useState(false);

  const handleChange = async (newGrade: string) => {
    if (newGrade === grade) return;

    setIsPending(true);
    const result = await updateUserInternGrade(userId, newGrade || null);

    if (result.success) {
      setGrade(newGrade);
    } else {
      alert(result.error || "Failed to update grade");
    }
    setIsPending(false);
  };

  if (readOnly) {
    return grade ? (
      <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${GRADE_BADGE_STYLES[grade] || "bg-gray-100 text-gray-700"}`}>
        {grade}
      </span>
    ) : (
      <span className="text-xs text-gray-300">-</span>
    );
  }

  return (
    <select
      value={grade}
      onChange={(e) => handleChange(e.target.value)}
      disabled={isPending}
      className="block w-full rounded-md border-gray-300 py-1 pl-3 pr-10 text-base focus:border-orange-500 focus:outline-none focus:ring-orange-500 sm:text-sm disabled:opacity-50"
    >
      <option value="">- ไม่ใช่เด็กฝึกงาน -</option>
      <option value="A">A</option>
      <option value="B">B</option>
      <option value="C">C</option>
    </select>
  );
}
