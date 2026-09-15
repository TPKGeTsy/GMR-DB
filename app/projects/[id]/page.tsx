import { getProjectById, getUserOptions } from "@/app/actions/projects";
import { getSandboxDiagramsForProject, getUnlinkedSandboxDiagrams } from "@/app/actions/wiring";
import { auth } from "@/auth";
import ProjectMemberManager from "@/components/ProjectMemberManager";
import ProjectStatusSelect from "@/components/ProjectStatusSelect";
import ProjectCircuitManager from "@/components/ProjectCircuitManager";
import ProjectFileManager from "@/components/ProjectFileManager";
import DeadlineBadge from "@/components/DeadlineBadge";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Users, Calendar, Briefcase, Cpu, Paperclip } from "lucide-react";
import { formatThaiDate } from "@/lib/datetime";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [projectResult, usersResult, session] = await Promise.all([
    getProjectById(id),
    getUserOptions(),
    auth(),
  ]);

  if (!projectResult.success || !projectResult.data) notFound();

  const project = projectResult.data;
  const allUsers = usersResult.success && usersResult.data ? usersResult.data : [];
  const canManage = session?.user?.role === "ADMIN" || session?.user?.id === project.createdById;

  const [circuitsResult, unlinkedResult] = await Promise.all([
    getSandboxDiagramsForProject(id),
    canManage ? getUnlinkedSandboxDiagrams() : Promise.resolve({ success: true, data: [] }),
  ]);
  const circuits = circuitsResult.success && circuitsResult.data ? circuitsResult.data : [];
  const unlinkedCircuits = unlinkedResult.success && unlinkedResult.data ? unlinkedResult.data : [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center space-x-4">
          <Link href="/projects" className="text-gray-700 hover:text-gray-900">
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <Briefcase className="mr-2 h-6 w-6 text-orange-600" />
            {project.name}
          </h1>
        </div>
        <DeadlineBadge endDate={project.endDate} status={project.status} className="text-sm px-3 py-1" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white p-6 shadow rounded-lg border border-gray-100 space-y-4">
            <div>
              <p className="text-xs text-gray-400 mb-1">รายละเอียด</p>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{project.description || "ไม่มีรายละเอียด"}</p>
            </div>
            {project.client && (
              <div>
                <p className="text-xs text-gray-400 mb-1">ลูกค้า / ผู้ว่าจ้าง</p>
                <p className="text-sm text-gray-900">{project.client}</p>
              </div>
            )}
            <div className="flex items-center text-xs text-gray-500">
              <Calendar className="w-3.5 h-3.5 mr-1.5" />
              {project.startDate ? formatThaiDate(project.startDate) : "?"}
              {" – "}
              {project.endDate ? formatThaiDate(project.endDate) : "?"}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">สถานะ:</span>
              {canManage ? (
                <ProjectStatusSelect projectId={project.id} initialStatus={project.status} />
              ) : (
                <span className="text-sm text-gray-900">{project.status}</span>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white p-6 shadow rounded-lg border border-gray-100">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center">
            <Users className="w-4 h-4 mr-1.5" />
            ทีมงาน ({project.members.length})
          </h2>
          <ProjectMemberManager
            projectId={project.id}
            members={project.members}
            allUsers={allUsers}
            ownerId={project.createdById}
            canManage={canManage}
          />
        </div>

        <div className="bg-white p-6 shadow rounded-lg border border-gray-100 md:col-span-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center">
            <Cpu className="w-4 h-4 mr-1.5" />
            วงจร (Circuit Diagrams) ({circuits.length})
          </h2>
          <ProjectCircuitManager
            projectId={project.id}
            circuits={circuits}
            unlinkedCircuits={unlinkedCircuits}
            canManage={canManage}
            currentUserId={session?.user?.id}
            isAdmin={session?.user?.role === "ADMIN"}
          />
        </div>

        <div className="bg-white p-6 shadow rounded-lg border border-gray-100 md:col-span-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center">
            <Paperclip className="w-4 h-4 mr-1.5" />
            ไฟล์แนบ ({project.files.length})
          </h2>
          <ProjectFileManager
            projectId={project.id}
            files={project.files}
            currentUserId={session?.user?.id}
            isAdmin={session?.user?.role === "ADMIN"}
            canManage={canManage}
          />
        </div>
      </div>
    </div>
  );
}
