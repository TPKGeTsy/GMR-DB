"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { unlinkLineAccount } from "@/app/actions/auth";
import { MessageCircle, Unlink } from "lucide-react";

export default function LineAccountPanel({
  userId,
  username,
  isLinked,
}: {
  userId: string;
  username: string;
  isLinked: boolean;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUnlink = async () => {
    if (!confirm(`เลิกผูกบัญชี LINE ของ "${username}"? หลังจากนี้พนักงานคนนี้ต้องพิมพ์ username/password ในแชท LINE ใหม่เพื่อผูกอีกครั้ง`)) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    const result = await unlinkLineAccount(userId);
    if (!result.success) {
      setError(result.error || "เลิกผูกบัญชีไม่สำเร็จ");
    } else {
      router.refresh();
    }
    setIsSubmitting(false);
  };

  return (
    <div className="bg-white p-6 shadow rounded-lg border border-gray-100">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center">
        <MessageCircle className="w-4 h-4 mr-1.5" />
        LINE Account
      </h2>

      {isLinked ? (
        <div className="space-y-3">
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-700">
            ผูกบัญชี LINE แล้ว
          </span>
          <p className="text-xs text-gray-500">
            ถ้าพนักงานคนนี้ผูก LINE ผิดคน หรืออยากย้ายไปผูกกับ account อื่น ให้เลิกผูกที่นี่ก่อน แล้วให้เขาพิมพ์
            username/password ในแชท LINE ส่วนตัวกับบอทใหม่อีกครั้ง (พิมพ์ผูกกับ account ไหนก็ได้ที่ยังไม่มี LINE ผูกอยู่)
          </p>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            onClick={handleUnlink}
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50 text-sm font-semibold"
          >
            <Unlink className="w-4 h-4" />
            {isSubmitting ? "กำลังเลิกผูก..." : "เลิกผูกบัญชี LINE"}
          </button>
        </div>
      ) : (
        <p className="text-xs text-gray-400">
          ยังไม่ได้ผูกบัญชี LINE — พนักงานพิมพ์ username/password ในแชท LINE ส่วนตัวกับบอทเพื่อผูกบัญชีได้เลย
        </p>
      )}
    </div>
  );
}
