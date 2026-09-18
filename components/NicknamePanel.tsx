"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateNickname } from "@/app/actions/auth";
import { Tag, Pencil } from "lucide-react";

export default function NicknamePanel({
  userId,
  initialNickname,
}: {
  userId: string;
  initialNickname: string | null;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(initialNickname || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    const result = await updateNickname(userId, value);
    if (!result.success) {
      setError(result.error || "บันทึกชื่อเล่นไม่สำเร็จ");
    } else {
      setIsEditing(false);
      router.refresh();
    }
    setIsSubmitting(false);
  };

  if (isEditing) {
    return (
      <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={20}
          autoFocus
          placeholder="เช่น เก่ง"
          className="w-32 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
        />
        <button
          type="submit"
          disabled={isSubmitting}
          className="text-xs font-semibold text-orange-600 hover:text-orange-700 disabled:opacity-50"
        >
          บันทึก
        </button>
        <button
          type="button"
          onClick={() => {
            setIsEditing(false);
            setValue(initialNickname || "");
            setError(null);
          }}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          ยกเลิก
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </form>
    );
  }

  return (
    <button
      onClick={() => setIsEditing(true)}
      className="flex items-center gap-1.5 text-sm font-medium text-gray-900 hover:text-orange-600 group"
    >
      <Tag className="w-3.5 h-3.5 text-gray-400" />
      {initialNickname || <span className="text-gray-400 italic font-normal">ยังไม่ได้ตั้งชื่อเล่น</span>}
      <Pencil className="w-3 h-3 text-gray-300 group-hover:text-orange-500" />
    </button>
  );
}
