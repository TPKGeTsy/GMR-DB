"use client";

import { useState } from "react";
import { approveUser, rejectUser, type PendingUserRow } from "@/app/actions/auth";
import { CheckCircle2, XCircle, User } from "lucide-react";
import { formatThaiDateTime } from "@/lib/datetime";

export default function PendingUsersList({ initialUsers }: { initialUsers: PendingUserRow[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleApprove = async (id: string) => {
    setBusyId(id);
    setError(null);
    const result = await approveUser(id);
    if (result.success) {
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } else {
      setError(result.error || "อนุมัติไม่สำเร็จ");
    }
    setBusyId(null);
  };

  const handleReject = async (id: string) => {
    if (!confirm("ปฏิเสธและลบบัญชีนี้ทิ้งเลยใช่ไหม?")) return;
    setBusyId(id);
    setError(null);
    const result = await rejectUser(id);
    if (result.success) {
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } else {
      setError(result.error || "ปฏิเสธไม่สำเร็จ");
    }
    setBusyId(null);
  };

  if (users.length === 0) {
    return (
      <div className="bg-white shadow rounded-lg border border-gray-100 p-10 text-center text-sm text-gray-500">
        ไม่มีบัญชีรออนุมัติ
      </div>
    );
  }

  return (
    <div className="bg-white shadow overflow-hidden sm:rounded-lg divide-y divide-gray-100">
      {error && <p className="px-6 py-3 text-sm text-red-600 bg-red-50">{error}</p>}
      {users.map((u) => (
        <div key={u.id} className="px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center">
            <div className="h-10 w-10 flex-shrink-0 bg-orange-100 rounded-full flex items-center justify-center">
              <User className="h-6 w-6 text-orange-600" />
            </div>
            <div className="ml-4">
              <div className="text-sm font-medium text-gray-900">{u.username}</div>
              <div className="text-xs text-gray-500">{u.fullName || "No full name"}</div>
              <div className="text-[10px] text-gray-400">สมัครเมื่อ {formatThaiDateTime(u.createdAt)}</div>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => handleApprove(u.id)}
              disabled={busyId === u.id}
              className="inline-flex items-center px-3 py-1.5 rounded-md bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              อนุมัติ
            </button>
            <button
              onClick={() => handleReject(u.id)}
              disabled={busyId === u.id}
              className="inline-flex items-center px-3 py-1.5 rounded-md bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50"
            >
              <XCircle className="w-3.5 h-3.5 mr-1" />
              ปฏิเสธ
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
