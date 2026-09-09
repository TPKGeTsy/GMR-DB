"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { returnLoan } from "@/app/actions/loans";
import { Undo2 } from "lucide-react";

export default function ReturnLoanButton({ loanId }: { loanId: string }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleReturn = async () => {
    if (!confirm("ยืนยันการคืนของ?")) return;
    setIsSubmitting(true);
    const result = await returnLoan(loanId);
    if (!result.success) {
      alert(result.error || "คืนของไม่สำเร็จ");
      setIsSubmitting(false);
      return;
    }
    router.refresh();
  };

  return (
    <button
      onClick={handleReturn}
      disabled={isSubmitting}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 text-xs font-semibold transition-colors"
    >
      <Undo2 className="w-3.5 h-3.5" />
      {isSubmitting ? "กำลังคืน..." : "คืนของ"}
    </button>
  );
}
