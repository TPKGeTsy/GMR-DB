"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { verifyKioskSecret } from "@/app/actions/checkin";

export default function KioskSetupForm() {
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const result = await verifyKioskSecret(secret);

    if (!result.success) {
      setError(result.error || "ตั้งค่าไม่สำเร็จ");
      setIsSubmitting(false);
      return;
    }

    router.push("/checkin");
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        type="password"
        value={secret}
        onChange={(e) => setSecret(e.target.value)}
        placeholder="รหัสลับของบริษัท"
        required
        autoFocus
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full px-3 py-2 rounded-md bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 disabled:opacity-50"
      >
        {isSubmitting ? "กำลังตรวจสอบ..." : "ยืนยันเครื่องนี้"}
      </button>
    </form>
  );
}
