"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelLeaveRequest } from "@/app/actions/leave";
import { XCircle } from "lucide-react";

export default function CancelLeaveButton({ leaveRequestId }: { leaveRequestId: string }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCancel = async () => {
    if (!confirm("ยืนยันการยกเลิกใบลานี้?")) return;
    setIsSubmitting(true);
    const result = await cancelLeaveRequest(leaveRequestId);
    if (!result.success) {
      alert(result.error || "ยกเลิกไม่สำเร็จ");
      setIsSubmitting(false);
      return;
    }
    router.refresh();
  };

  return (
    <button
      onClick={handleCancel}
      disabled={isSubmitting}
      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50 text-xs font-medium transition-colors"
    >
      <XCircle className="w-3.5 h-3.5" />
      ยกเลิกใบลา
    </button>
  );
}
