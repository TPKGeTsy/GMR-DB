import prisma from "@/lib/prisma";
import { auth } from "@/auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Ruler } from "lucide-react";
import SteelPlanEditor from "@/components/SteelPlanEditor";
import PageHelp from "@/components/PageHelp";

export const dynamic = "force-dynamic";

export default async function SteelPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [session, plan, projects] = await Promise.all([
    auth(),
    prisma.steelPlan.findUnique({
      where: { id },
      include: {
        parts: { orderBy: { createdAt: "asc" } },
        stock: { orderBy: { createdAt: "asc" } },
        bars: true,
        project: { select: { createdById: true, members: { select: { userId: true } } } },
      },
    }),
    prisma.project.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!plan) notFound();

  const userId = session?.user?.id;
  const canEdit =
    !!userId &&
    (plan.createdById === userId ||
      session?.user?.role === "ADMIN" ||
      (!!plan.project && (plan.project.createdById === userId || plan.project.members.some((m) => m.userId === userId))));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-4 print:hidden">
        <Link href="/steel-cutting" className="text-gray-700 hover:text-gray-900">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <Ruler className="h-6 w-6 text-orange-600" />
          {plan.name}
          <PageHelp id="steelCutting" />
        </h1>
      </div>
      <SteelPlanEditor
        plan={{ id: plan.id, name: plan.name, kerf: plan.kerf, newBarLength: plan.newBarLength, projectId: plan.projectId }}
        parts={plan.parts.map((p) => ({
          id: p.id,
          steelType: p.steelType,
          sectionX: p.sectionX,
          sectionY: p.sectionY,
          thickness: p.thickness,
          cutLength: p.cutLength,
          quantity: p.quantity,
        }))}
        stock={plan.stock.map((s) => ({
          id: s.id,
          steelType: s.steelType,
          sectionX: s.sectionX,
          sectionY: s.sectionY,
          thickness: s.thickness,
          length: s.length,
          quantity: s.quantity,
        }))}
        bars={plan.bars.map((b) => ({
          steelType: b.steelType,
          sectionX: b.sectionX,
          sectionY: b.sectionY,
          thickness: b.thickness,
          length: b.length,
        }))}
        projects={projects}
        canEdit={canEdit}
      />
    </div>
  );
}
