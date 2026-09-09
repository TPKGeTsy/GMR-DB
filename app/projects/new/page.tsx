"use client";

import { createProject } from "@/app/actions/projects";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";

export default function NewProjectPage() {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setError(null);

    const data = new FormData(event.currentTarget);
    const result = await createProject(data);

    if (result.success && result.data) {
      router.push(`/projects/${result.data.id}`);
    } else {
      setError(result.error || "Something went wrong");
      setIsPending(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center space-x-4">
        <Link href="/projects" className="text-gray-700 hover:text-gray-900">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Add Project</h1>
      </div>

      <div className="bg-white shadow sm:rounded-lg">
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border-l-4 border-red-400 p-4">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-900 mb-1">
              ชื่อโปรเจกต์ (Project Name)
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              placeholder="เช่น ติดตั้งระบบไฟฟ้าโรงงาน A"
              className="shadow-sm focus:ring-orange-500 focus:border-orange-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border h-[42px] placeholder-gray-500 text-gray-900"
            />
          </div>

          <div>
            <label htmlFor="client" className="block text-sm font-medium text-gray-900 mb-1">
              ลูกค้า / ผู้ว่าจ้าง (Client)
            </label>
            <input
              type="text"
              id="client"
              name="client"
              placeholder="ไม่บังคับ"
              className="shadow-sm focus:ring-orange-500 focus:border-orange-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border h-[42px] placeholder-gray-500 text-gray-900"
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-900 mb-1">
              รายละเอียด (Description)
            </label>
            <textarea
              id="description"
              name="description"
              rows={4}
              placeholder="ไม่บังคับ"
              className="shadow-sm focus:ring-orange-500 focus:border-orange-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border placeholder-gray-500 text-gray-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="startDate" className="block text-sm font-medium text-gray-900 mb-1">
                วันเริ่มต้น
              </label>
              <input
                type="date"
                id="startDate"
                name="startDate"
                className="shadow-sm focus:ring-orange-500 focus:border-orange-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border h-[42px] text-gray-900"
              />
            </div>
            <div>
              <label htmlFor="endDate" className="block text-sm font-medium text-gray-900 mb-1">
                วันสิ้นสุด (โดยประมาณ)
              </label>
              <input
                type="date"
                id="endDate"
                name="endDate"
                className="shadow-sm focus:ring-orange-500 focus:border-orange-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border h-[42px] text-gray-900"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <Link
              href="/projects"
              className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-900 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isPending}
              className="ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50"
            >
              {isPending ? "Saving..." : (
                <>
                  <Save className="-ml-1 mr-2 h-5 w-5" />
                  Save Project
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
