"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { approveLeaveRequest, rejectLeaveRequest } from "@/app/actions/leave";
import { Check, X } from "lucide-react";

export default function LeaveApprovalButtons({ leaveRequestId }: { leaveRequestId: string }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handle = async (action: "approve" | "reject") => {
    setIsSubmitting(true);
    const result =
      action === "approve" ? await approveLeaveRequest(leaveRequestId) : await rejectLeaveRequest(leaveRequestId);
    if (!result.success) {
      alert(result.error || "ดำเนินการไม่สำเร็จ");
      setIsSubmitting(false);
      return;
    }
    router.refresh();
  };

  return (
    <div className="flex gap-1.5">
      <button
        onClick={() => handle("approve")}
        disabled={isSubmitting}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 text-xs font-semibold transition-colors"
      >
        <Check className="w-3.5 h-3.5" />
        อนุมัติ
      </button>
      <button
        onClick={() => handle("reject")}
        disabled={isSubmitting}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 text-xs font-semibold transition-colors"
      >
        <X className="w-3.5 h-3.5" />
        ปฏิเสธ
      </button>
    </div>
  );
}
