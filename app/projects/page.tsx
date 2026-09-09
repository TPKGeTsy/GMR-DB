import { getProjects } from "@/app/actions/projects";
import Link from "next/link";
import { Briefcase, Plus, Users, User, Calendar } from "lucide-react";

export const dynamic = "force-dynamic";

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  client: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  createdBy: { username: string; fullName: string | null };
  _count: { members: number };
}

const statusBadge: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  COMPLETED: "bg-blue-100 text-blue-700",
  ON_HOLD: "bg-yellow-100 text-yellow-800",
};

const statusLabel: Record<string, string> = {
  ACTIVE: "กำลังดำเนินการ",
  COMPLETED: "เสร็จสิ้น",
  ON_HOLD: "พักไว้",
};

export default async function ProjectsPage() {
  const result = await getProjects();
  const projects: ProjectRow[] = result.success && result.data ? result.data : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <Briefcase className="mr-2 h-6 w-6 text-orange-600" />
            Projects
          </h1>
          <p className="text-gray-500">งานที่ได้รับมา พร้อมทีมงานที่ร่วมโปรเจกต์</p>
        </div>
        <Link
          href="/projects/new"
          className="inline-flex items-center px-4 py-2 rounded-md text-white bg-orange-600 hover:bg-orange-700 font-medium text-sm shadow-sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Project
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-200 rounded-lg py-16 text-center text-sm text-gray-400">
          ยังไม่มีโปรเจกต์ในระบบ — กด &quot;Add Project&quot; เพื่อเริ่มต้น
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="bg-white rounded-lg shadow-sm border border-gray-100 p-5 hover:shadow-md hover:border-orange-200 transition-all"
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-gray-900">{p.name}</h3>
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${statusBadge[p.status] || "bg-gray-100 text-gray-500"}`}>
                  {statusLabel[p.status] || p.status}
                </span>
              </div>
              {p.client && <p className="text-xs text-gray-500 mb-1">ลูกค้า: {p.client}</p>}
              <p className="text-sm text-gray-600 line-clamp-2 mb-4 min-h-[2.5rem]">
                {p.description || "ไม่มีรายละเอียด"}
              </p>
              <div className="flex items-center justify-between text-[11px] text-gray-500 border-t border-gray-50 pt-3">
                <div className="flex items-center">
                  <User className="w-3 h-3 mr-1" />
                  {p.createdBy.fullName || p.createdBy.username}
                </div>
                <div className="flex items-center">
                  <Users className="w-3 h-3 mr-1" />
                  {p._count.members} คน
                </div>
              </div>
              {(p.startDate || p.endDate) && (
                <div className="flex items-center text-[11px] text-gray-400 mt-1">
                  <Calendar className="w-3 h-3 mr-1" />
                  {p.startDate ? new Date(p.startDate).toLocaleDateString("th-TH") : "?"}
                  {" – "}
                  {p.endDate ? new Date(p.endDate).toLocaleDateString("th-TH") : "?"}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
