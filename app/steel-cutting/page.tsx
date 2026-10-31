import prisma from "@/lib/prisma";
import Link from "next/link";
import { Ruler, Briefcase, Recycle } from "lucide-react";
import SteelPlanCreateForm from "@/components/SteelPlanCreateForm";
import PageHelp from "@/components/PageHelp";
import { formatThaiDateTime } from "@/lib/datetime";

export const dynamic = "force-dynamic";

/** The search words: a number matches a steel size, a thickness or a cut length in the plan's rows (50 = 50x50, 1742 = a cut),
 *  any other word matches the plan or project name. Every word has to match. */
function searchFilter(q: string) {
  // "50x50x2.3" is three numbers; other words are kept whole.
  const words = q.split(/[\s,]+/).flatMap((w) => (/^[\d.]+([x×][\d.]+)+$/i.test(w) ? w.split(/[x×]/i) : [w])).filter(Boolean).slice(0, 6);
  return words.map((w) => {
    const n = Number(w);
    if (Number.isFinite(n) && n > 0) {
      return { parts: { some: { OR: [{ sectionX: n }, { sectionY: n }, { thickness: n }, { cutLength: n }] } } };
    }
    return { OR: [{ name: { contains: w, mode: "insensitive" as const } }, { project: { name: { contains: w, mode: "insensitive" as const } } }] };
  });
}

export default async function SteelCuttingPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim().slice(0, 100);
  const [plans, projects] = await Promise.all([
    prisma.steelPlan.findMany({
      where: q ? { AND: searchFilter(q) } : undefined,
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

      <Link
        href="/steel-cutting/offcuts"
        className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm hover:border-orange-300"
      >
        <Recycle className="h-5 w-5 shrink-0 text-orange-600" />
        <span>
          <span className="block font-medium text-gray-900">คลังเศษเหล็ก</span>
          <span className="block text-xs text-gray-500">เศษที่เก็บไว้ใช้ต่อ — แผนใหม่เลือกใช้ก่อนซื้อใหม่</span>
        </span>
      </Link>

      <SteelPlanCreateForm projects={projects} />

      <form className="flex flex-wrap items-center gap-2" action="/steel-cutting">
        <input
          name="q"
          defaultValue={q}
          placeholder="ค้นหาแผนเก่า: ชื่อแผน / โปรเจกต์ / ขนาดเหล็ก (เช่น 50 75) / ความยาวตัด (เช่น 1742)"
          className="min-w-0 flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded bg-gray-800 px-3 py-2 text-sm text-white hover:bg-gray-700">
          ค้นหา
        </button>
        {q && (
          <Link href="/steel-cutting" className="text-sm text-gray-500 hover:underline">
            ล้าง
          </Link>
        )}
      </form>

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
