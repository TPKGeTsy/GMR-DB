"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteScheduleEntry } from "@/app/actions/workschedule";
import { Trash2 } from "lucide-react";

export default function DeleteScheduleEntryButton({ id }: { id: string }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDelete = async () => {
    if (!confirm("ลบรายการตารางงานนี้?")) return;
    setIsSubmitting(true);
    const result = await deleteScheduleEntry(id);
    if (!result.success) {
      alert(result.error || "ลบไม่สำเร็จ");
      setIsSubmitting(false);
      return;
    }
    router.refresh();
  };

  return (
    <button
      onClick={handleDelete}
      disabled={isSubmitting}
      className="text-gray-400 hover:text-red-600 disabled:opacity-50 p-1.5 rounded-md hover:bg-red-50 transition-colors"
      title="ลบ"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  );
}
