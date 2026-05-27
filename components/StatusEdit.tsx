"use client";

import { useState } from "react";
import { updateAssetStatus } from "@/app/actions/assets";

interface StatusEditProps {
  id: string;
  initialStatus: string;
}

export default function StatusEdit({ id, initialStatus }: StatusEditProps) {
  const [status, setStatus] = useState(initialStatus);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleStatusChange = async (newStatus: string) => {
    setIsUpdating(true);
    const result = await updateAssetStatus(id, newStatus);
    if (result.success) {
      setStatus(newStatus);
    } else {
      // Revert if failed
      setStatus(status);
      alert(result.error || "Failed to update status");
    }
    setIsUpdating(false);
  };

  const getStatusColorClass = (s: string) => {
    switch (s) {
      case "R": return "bg-red-600 text-white";
      case "Y": return "bg-yellow-400 text-black";
      case "G": return "bg-green-500 text-white";
      case "B": return "bg-blue-500 text-white";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="flex items-center justify-center">
      <select
        value={status}
        disabled={isUpdating}
        onChange={(e) => handleStatusChange(e.target.value)}
        className={`px-3 py-1 text-xs leading-5 font-semibold rounded-full border-none cursor-pointer focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 appearance-none text-center transition-colors ${getStatusColorClass(status)} ${isUpdating ? "opacity-50" : ""}`}
        title="เปลี่ยนสถานะ"
      >
        <option value="R">R</option>
        <option value="Y">Y</option>
        <option value="G">G</option>
        <option value="B">B</option>
      </select>
    </div>
  );
}
