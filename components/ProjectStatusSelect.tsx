"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateProjectStatus } from "@/app/actions/projects";

const options = [
  { value: "ACTIVE", label: "กำลังดำเนินการ" },
  { value: "ON_HOLD", label: "พักไว้" },
  { value: "COMPLETED", label: "เสร็จสิ้น" },
];

export default function ProjectStatusSelect({ projectId, initialStatus }: { projectId: string; initialStatus: string }) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [isPending, setIsPending] = useState(false);

  const handleChange = async (newStatus: string) => {
    if (newStatus === status) return;
    setIsPending(true);
    const result = await updateProjectStatus(projectId, newStatus as "ACTIVE" | "COMPLETED" | "ON_HOLD");
    if (result.success) {
      setStatus(newStatus);
      router.refresh();
    } else {
      alert(result.error || "อัพเดทไม่สำเร็จ");
    }
    setIsPending(false);
  };

  return (
    <select
      value={status}
      onChange={(e) => handleChange(e.target.value)}
      disabled={isPending}
      className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none disabled:opacity-50"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
