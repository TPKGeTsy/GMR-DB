import prisma from "@/lib/prisma";
import { auth } from "@/auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Ruler } from "lucide-react";
import SteelPlanEditor from "@/components/SteelPlanEditor";
import PageHelp from "@/components/PageHelp";
import SteelHardwarePanel from "@/components/SteelHardwarePanel";
import SteelSheetPanel, { type SheetPartRow } from "@/components/SteelSheetPanel";
import SteelNestingPanel from "@/components/SteelNestingPanel";

export const dynamic = "force-dynamic";
// Reading a picture with the vision model can take a while.
export const maxDuration = 60;

export default async function SteelPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ skipped?: string }>;
}) {
  const { id } = await params;
  const skippedCount = Math.max(0, Number((await searchParams).skipped) || 0);
  const [session, plan, projects] = await Promise.all([
    auth(),
    prisma.steelPlan.findUnique({
      where: { id },
      include: {
        parts: { orderBy: { createdAt: "asc" } },
        bars: true,
        hardware: { orderBy: { createdAt: "asc" } },
        sheetParts: { orderBy: { createdAt: "asc" } },
        nestDone: true,
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

  const sheetParts = plan.sheetParts.map((p) => ({ ...p, features: p.features, steps: p.steps, geometry: p.geometry })) as unknown as SheetPartRow[];

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
          note: p.note,
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
        skippedCount={skippedCount}
      >
        <SteelHardwarePanel
          planId={plan.id}
          canEdit={canEdit}
          rows={plan.hardware.map((h) => ({
            id: h.id,
            itemNo: h.itemNo,
            partNumber: h.partNumber,
            description: h.description,
            quantity: h.quantity,
            category: h.category,
          }))}
        />
        <SteelSheetPanel planId={plan.id} canEdit={canEdit} parts={sheetParts} />
        <SteelNestingPanel
          planId={plan.id}
          parts={sheetParts}
          defaultGap={plan.kerf}
          canEdit={canEdit}
          doneBySignature={Object.fromEntries(plan.nestDone.map((d) => [d.signature, d.done]))}
        />
      </SteelPlanEditor>
    </div>
  );
}
