"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  linkSandboxDiagramToProject,
  unlinkSandboxDiagramFromProject,
  deleteSandboxDiagram,
} from "@/app/actions/wiring";
import { Cpu, Link2, Unlink, Trash2, Plus } from "lucide-react";

interface CircuitDiagram {
  id: string;
  name: string;
  ownerId: string;
  owner: { username: string };
}

export default function ProjectCircuitManager({
  projectId,
  circuits,
  unlinkedCircuits,
  canManage,
  currentUserId,
  isAdmin,
}: {
  projectId: string;
  circuits: CircuitDiagram[];
  unlinkedCircuits: CircuitDiagram[];
  canManage: boolean;
  currentUserId?: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLink = async () => {
    if (!selectedId) return;
    setIsSubmitting(true);
    setError(null);
    const result = await linkSandboxDiagramToProject(selectedId, projectId);
    if (result.success) {
      setSelectedId("");
      router.refresh();
    } else {
      setError(result.error || "เชื่อมวงจรไม่สำเร็จ");
    }
    setIsSubmitting(false);
  };

  const handleUnlink = async (id: string) => {
    if (!confirm("นำวงจรนี้ออกจากโปรเจกต์? (วงจรจะยังอยู่ ไม่ถูกลบ)")) return;
    setIsSubmitting(true);
    const result = await unlinkSandboxDiagramFromProject(id);
    if (!result.success) alert(result.error || "นำออกไม่สำเร็จ");
    setIsSubmitting(false);
    router.refresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("ลบวงจรนี้ถาวร? การกระทำนี้ย้อนกลับไม่ได้")) return;
    setIsSubmitting(true);
    const result = await deleteSandboxDiagram(id);
    if (!result.success) alert(result.error || "ลบไม่สำเร็จ");
    setIsSubmitting(false);
    router.refresh();
  };

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex flex-col gap-2">
          <Link
            href={`/circuit?projectId=${projectId}`}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-900 text-white hover:bg-gray-800 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            สร้างวงจรใหม่สำหรับโปรเจกต์นี้
          </Link>

          {unlinkedCircuits.length > 0 && (
            <div className="flex gap-2">
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
              >
                <option value="">เชื่อมวงจรที่มีอยู่แล้ว...</option>
                {unlinkedCircuits.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.owner.username})</option>
                ))}
              </select>
              <button
                onClick={handleLink}
                disabled={isSubmitting || !selectedId}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 text-sm font-medium"
              >
                <Link2 className="w-4 h-4" />
                เชื่อม
              </button>
            </div>
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}

      {circuits.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-3">ยังไม่มีวงจรที่เชื่อมกับโปรเจกต์นี้</p>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-md overflow-hidden">
          {circuits.map((c) => {
            const canDelete = isAdmin || c.ownerId === currentUserId;
            return (
              <li key={c.id} className="flex items-center justify-between px-3 py-2 bg-white gap-2">
                <Link
                  href={`/diagrams/${c.id}`}
                  className="flex items-center gap-1.5 text-sm text-gray-900 hover:text-orange-600 truncate"
                >
                  <Cpu className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  <span className="truncate">{c.name}</span>
                  <span className="text-[10px] text-gray-400 flex-shrink-0">({c.owner.username})</span>
                </Link>
                {canManage && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleUnlink(c.id)}
                      disabled={isSubmitting}
                      className="text-gray-400 hover:text-orange-600 disabled:opacity-50"
                      title="นำออกจากโปรเจกต์"
                    >
                      <Unlink className="w-3.5 h-3.5" />
                    </button>
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(c.id)}
                        disabled={isSubmitting}
                        className="text-gray-400 hover:text-red-600 disabled:opacity-50"
                        title="ลบถาวร"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
