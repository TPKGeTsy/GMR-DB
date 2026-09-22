"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { decideOtApprovalRequest } from "@/app/actions/ot";
import { Check, X } from "lucide-react";

export default function OtApprovalRequestActions({ id, employeeName }: { id: string; employeeName: string }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  const decide = async (decision: "APPROVE" | "REJECT") => {
    if (decision === "REJECT" && !confirm(`ปฏิเสธคำขอ OT ของ "${employeeName}" นี้?`)) return;
    setIsPending(true);
    const result = await decideOtApprovalRequest(id, decision);
    if (!result.success) alert(result.error || "ดำเนินการไม่สำเร็จ");
    setIsPending(false);
    router.refresh();
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => decide("APPROVE")}
        disabled={isPending}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:opacity-50"
      >
        <Check className="w-3.5 h-3.5" />
        อนุมัติ
      </button>
      <button
        onClick={() => decide("REJECT")}
        disabled={isPending}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-100 text-red-700 text-xs font-semibold hover:bg-red-200 disabled:opacity-50"
      >
        <X className="w-3.5 h-3.5" />
        ปฏิเสธ
      </button>
    </div>
  );
}
