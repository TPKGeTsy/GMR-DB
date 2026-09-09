"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addProjectMember, removeProjectMember } from "@/app/actions/projects";
import { UserPlus, X } from "lucide-react";

interface Member {
  userId: string;
  user: { id: string; username: string; fullName: string | null };
}

interface UserOption {
  id: string;
  name: string;
}

export default function ProjectMemberManager({
  projectId,
  members,
  allUsers,
  ownerId,
  canManage,
}: {
  projectId: string;
  members: Member[];
  allUsers: UserOption[];
  ownerId: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [selectedUserId, setSelectedUserId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const memberIds = new Set(members.map((m) => m.userId));
  const availableUsers = allUsers.filter((u) => !memberIds.has(u.id));

  const handleAdd = async () => {
    if (!selectedUserId) return;
    setIsSubmitting(true);
    setError(null);
    const result = await addProjectMember(projectId, selectedUserId);
    if (result.success) {
      setSelectedUserId("");
      router.refresh();
    } else {
      setError(result.error || "เพิ่มไม่สำเร็จ");
    }
    setIsSubmitting(false);
  };

  const handleRemove = async (userId: string) => {
    if (!confirm("นำพนักงานคนนี้ออกจากโปรเจกต์?")) return;
    setIsSubmitting(true);
    const result = await removeProjectMember(projectId, userId);
    if (!result.success) {
      alert(result.error || "นำออกไม่สำเร็จ");
    }
    setIsSubmitting(false);
    router.refresh();
  };

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex gap-2">
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
          >
            <option value="">เลือกพนักงานที่จะเพิ่ม...</option>
            {availableUsers.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            disabled={isSubmitting || !selectedUserId}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 text-sm font-medium"
          >
            <UserPlus className="w-4 h-4" />
            เพิ่ม
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}

      <ul className="divide-y divide-gray-100 border border-gray-100 rounded-md overflow-hidden">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center justify-between px-3 py-2 bg-white">
            <span className="text-sm text-gray-900">
              {m.user.fullName || m.user.username}
              {m.userId === ownerId && (
                <span className="ml-2 text-[10px] font-semibold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full">
                  เจ้าของโปรเจกต์
                </span>
              )}
            </span>
            {canManage && m.userId !== ownerId && (
              <button
                onClick={() => handleRemove(m.userId)}
                disabled={isSubmitting}
                className="text-gray-400 hover:text-red-600 disabled:opacity-50"
                title="นำออก"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
