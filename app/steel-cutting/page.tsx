import prisma from "@/lib/prisma";
import Link from "next/link";
import { Ruler, Briefcase } from "lucide-react";
import SteelPlanCreateForm from "@/components/SteelPlanCreateForm";
import PageHelp from "@/components/PageHelp";
import { formatThaiDateTime } from "@/lib/datetime";

export const dynamic = "force-dynamic";

export default async function SteelCuttingPage() {
  const [plans, projects] = await Promise.all([
    prisma.steelPlan.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        project: { select: { id: true, name: true } },
        createdBy: { select: { username: true, fullName: true, nickname: true } },
        _count: { select: { parts: true } },
      },
    }),
    prisma.project.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
        <Ruler className="h-6 w-6 text-orange-600" />
        Steel Cutting (ตัดเหล็ก)
        <PageHelp id="steelCutting" />
      </h1>

      <SteelPlanCreateForm projects={projects} />

      <div className="overflow-hidden rounded-lg border border-gray-100 bg-white shadow">
        {plans.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm italic text-gray-400">ยังไม่มีแผนตัดเหล็ก</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {plans.map((p) => (
              <li key={p.id}>
                <Link href={`/steel-cutting/${p.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{p.name}</p>
                    <p className="text-xs text-gray-500">
                      {p._count.parts} รายการตัด · โดย {p.createdBy.nickname || p.createdBy.fullName || p.createdBy.username} · บันทึกเมื่อ{" "}
                      {formatThaiDateTime(p.updatedAt)}
                    </p>
                  </div>
                  {p.project && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-xs text-orange-700">
                      <Briefcase className="h-3 w-3" />
                      {p.project.name}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
