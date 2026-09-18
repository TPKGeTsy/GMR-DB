"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteOtGrant } from "@/app/actions/ot";
import { Trash2 } from "lucide-react";

export default function DeleteOtGrantButton({ id, employeeName }: { id: string; employeeName: string }) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`ลบรายการเปิด OT ของ "${employeeName}" นี้ถาวร?`)) return;
    setIsDeleting(true);
    const result = await deleteOtGrant(id);
    if (!result.success) alert(result.error || "ลบไม่สำเร็จ");
    setIsDeleting(false);
    router.refresh();
  };

  return (
    <button
      onClick={handleDelete}
      disabled={isDeleting}
      className="text-gray-400 hover:text-red-600 disabled:opacity-50"
      title="ลบรายการนี้"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  );
}
