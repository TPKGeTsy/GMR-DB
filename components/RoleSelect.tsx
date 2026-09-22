"use client";

import { updateUserRole } from "@/app/actions/auth";
import { useState } from "react";

interface RoleSelectProps {
  userId: string;
  initialRole: string;
}

export default function RoleSelect({ userId, initialRole }: RoleSelectProps) {
  const [role, setRole] = useState(initialRole);
  const [isPending, setIsPending] = useState(false);

  const handleRoleChange = async (newRole: string) => {
    if (newRole === role) return;
    
    setIsPending(true);
    const result = await updateUserRole(userId, newRole);
    
    if (result.success) {
      setRole(newRole);
    } else {
      alert(result.error || "Failed to update role");
    }
    setIsPending(false);
  };

  return (
    <select
      value={role}
      onChange={(e) => handleRoleChange(e.target.value)}
      disabled={isPending}
      className="block w-full rounded-md border-gray-300 py-1 pl-3 pr-10 text-base focus:border-orange-500 focus:outline-none focus:ring-orange-500 sm:text-sm disabled:opacity-50"
    >
      <option value="USER">USER</option>
      <option value="OPERATOR">OPERATOR</option>
      <option value="SENIOR">SENIOR</option>
      <option value="ADMIN">ADMIN</option>
    </select>
  );
}
