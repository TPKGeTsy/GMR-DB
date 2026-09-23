"use client";

import { updateUserRole } from "@/app/actions/auth";
import { useState } from "react";

interface RoleSelectProps {
  userId: string;
  initialRole: string;
  // Operators can see everyone's role but only an Admin can change it —
  // render a plain badge instead of an interactive control for anyone else.
  readOnly?: boolean;
}

const ROLE_BADGE_STYLES: Record<string, string> = {
  ADMIN: "bg-purple-100 text-purple-700",
  OPERATOR: "bg-blue-100 text-blue-700",
  SENIOR: "bg-teal-100 text-teal-700",
  USER: "bg-gray-100 text-gray-700",
};

export default function RoleSelect({ userId, initialRole, readOnly = false }: RoleSelectProps) {
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

  if (readOnly) {
    return (
      <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${ROLE_BADGE_STYLES[role] || ROLE_BADGE_STYLES.USER}`}>
        {role}
      </span>
    );
  }

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
