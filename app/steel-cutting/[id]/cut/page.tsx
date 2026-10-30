import prisma from "@/lib/prisma";
import { auth } from "@/auth";
import { notFound } from "next/navigation";
import SteelCutSteps from "@/components/SteelCutSteps";
import type { SheetPartRow } from "@/components/SteelSheetPanel";

export const dynamic = "force-dynamic";

const num = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** The cutting job on its own page: step 1, 2, 3 ... one per sheet layout, parts numbered in cutting order. */
export default async function SteelCutPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ w?: string; h?: string; gap?: string; rot?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const [session, plan] = await Promise.all([
    auth(),
    prisma.steelPlan.findUnique({
      where: { id },
      include: {
        sheetParts: { orderBy: { createdAt: "asc" } },
        nestDone: true,
        project: { select: { createdById: true, members: { select: { userId: true } } } },
      },
    }),
  ]);
  if (!plan) notFound();

  const userId = session?.user?.id;
  const canEdit =
    !!userId &&
    (plan.createdById === userId ||
      session?.user?.role === "ADMIN" ||
      (!!plan.project && (plan.project.createdById === userId || plan.project.members.some((m) => m.userId === userId))));

  return (
    <SteelCutSteps
      planId={plan.id}
      planName={plan.name}
      parts={plan.sheetParts as unknown as SheetPartRow[]}
      defaultGap={plan.kerf}
      canEdit={canEdit}
      doneBySignature={Object.fromEntries(plan.nestDone.map((d) => [d.signature, d.done]))}
      initial={{
        width: num(query.w, 1219),
        height: num(query.h, 2438),
        gap: Number.isFinite(Number(query.gap)) && query.gap !== undefined && query.gap !== "" ? Number(query.gap) : plan.kerf,
        rotate: query.rot !== "0",
      }}
    />
  );
}
