"use client";

import { updateUserInternGrade } from "@/app/actions/wages";
import { useState } from "react";
import { gradeBadgeClass } from "@/lib/gradeColor";

interface InternGradeSelectProps {
  userId: string;
  initialGrade: string | null;
  gradeOptions: string[];
  readOnly?: boolean;
}

export default function InternGradeSelect({ userId, initialGrade, gradeOptions, readOnly = false }: InternGradeSelectProps) {
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
      <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${gradeBadgeClass(grade)}`}>{grade}</span>
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
      {gradeOptions.map((code) => (
        <option key={code} value={code}>
          {code}
        </option>
      ))}
      {/* Keep an existing (possibly deleted) grade selectable so it isn't
          silently swapped to blank just by rendering this dropdown. */}
      {grade && !gradeOptions.includes(grade) && (
        <option value={grade}>{grade} (ถูกลบแล้ว)</option>
      )}
    </select>
  );
}
