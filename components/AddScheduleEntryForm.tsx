"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createScheduleEntry } from "@/app/actions/workschedule";
import { Plus } from "lucide-react";

interface ProjectOption {
  id: string;
  name: string;
}

export default function AddScheduleEntryForm({ myProjects }: { myProjects: ProjectOption[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTitle("");
    setProjectId("");
    setStartAt("");
    setEndAt("");
    setNote("");
  };

  const handleSubmit = async () => {
    setError(null);
    setIsSubmitting(true);
    const result = await createScheduleEntry(title, startAt, endAt, projectId || null, note);
    if (result.success) {
      reset();
      setShowForm(false);
      router.refresh();
    } else {
      setError(result.error || "บันทึกไม่สำเร็จ");
    }
    setIsSubmitting(false);
  };

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="inline-flex items-center px-4 py-2 rounded-md text-white bg-orange-600 hover:bg-orange-700 font-medium text-sm shadow-sm"
      >
        <Plus className="w-4 h-4 mr-2" />
        เพิ่มตารางงาน
      </button>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg border border-gray-100 p-5 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500">หัวข้องาน</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="เช่น ติดตั้งอุปกรณ์หน้างาน"
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500">โปรเจกต์ (ไม่บังคับ)</label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
          >
            <option value="">— ไม่ระบุโปรเจกต์ —</option>
            {myProjects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500">เริ่มต้น</label>
          <input
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500">สิ้นสุด</label>
          <input
            type="datetime-local"
            value={endAt}
            onChange={(e) => setEndAt(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-gray-500">หมายเหตุ (ไม่บังคับ)</label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
        />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="px-4 py-2 rounded-md bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 text-sm font-semibold"
        >
          {isSubmitting ? "กำลังบันทึก..." : "บันทึกตารางงาน"}
        </button>
        <button
          onClick={() => { setShowForm(false); setError(null); }}
          disabled={isSubmitting}
          className="px-4 py-2 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50 text-sm"
        >
          ยกเลิก
        </button>
      </div>
    </div>
  );
}
