"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createSteelPlan } from "@/app/actions/steel";

export default function SteelPlanCreateForm({ projects }: { projects: { id: string; name: string }[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await createSteelPlan(name, projectId || null);
    if (!result.success) {
      setError(result.error);
      setBusy(false);
      return;
    }
    router.push(`/steel-cutting/${result.id}`);
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-100 bg-white p-4 shadow">
      <label className="block min-w-[12rem] flex-1 text-xs text-gray-500">
        ชื่อแผนตัดเหล็ก
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="เช่น ฐานเครื่อง Aisin ชุด 1"
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
      </label>
      <label className="block min-w-[12rem] text-xs text-gray-500">
        โปรเจกต์ (ถ้ามี)
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        >
          <option value="">— ไม่ผูกโปรเจกต์ —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="inline-flex items-center gap-1 rounded bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
      >
        <Plus className="h-4 w-4" />
        สร้างแผน
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  );
}
