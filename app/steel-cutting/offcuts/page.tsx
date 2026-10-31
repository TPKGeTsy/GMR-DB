import prisma from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft, Recycle } from "lucide-react";
import DeleteOffcutButton from "@/components/DeleteOffcutButton";
import { profileKey, profileLabel } from "@/lib/steel";
import { formatThaiDateTime } from "@/lib/datetime";

export const dynamic = "force-dynamic";

export default async function SteelOffcutsPage() {
  const offcuts = await prisma.steelOffcut.findMany({ orderBy: [{ steelType: "asc" }, { sectionX: "asc" }, { length: "desc" }] });
  const plans = await prisma.steelPlan.findMany({
    where: { id: { in: offcuts.flatMap((o) => (o.reservedPlanId ? [o.reservedPlanId] : [])) } },
    select: { id: true, name: true },
  });
  const planName = new Map(plans.map((p) => [p.id, p.name]));

  const groups = new Map<string, typeof offcuts>();
  for (const o of offcuts) groups.set(profileKey(o), [...(groups.get(profileKey(o)) ?? []), o]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/steel-cutting" className="text-gray-700 hover:text-gray-900">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <Recycle className="h-6 w-6 text-orange-600" />
          คลังเศษเหล็ก
        </h1>
      </div>
      <p className="text-sm text-gray-600">
        เศษที่เก็บไว้จากแผนตัดทุกแผน แผนใหม่ที่ใช้เหล็กชนิดเดียวกันจะเลือกใช้เศษพวกนี้ได้ก่อนซื้อใหม่ (ในหน้าแผน หัวข้อ &quot;เศษเหล็กในคลัง&quot;)
      </p>
      {offcuts.length === 0 ? (
        <p className="rounded-lg border border-gray-100 bg-white px-6 py-10 text-center text-sm italic text-gray-400 shadow">
          ยังไม่มีเศษในคลัง — ในหน้าแผนตัดเหล็ก กด &quot;เก็บเศษเข้าคลัง&quot; เมื่อจบงาน
        </p>
      ) : (
        [...groups.values()].map((list) => (
          <section key={profileKey(list[0])} className="overflow-hidden rounded-lg border border-gray-100 bg-white shadow">
            <h2 className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-800">
              {profileLabel(list[0])} <span className="font-normal text-gray-500">· {list.length} ชิ้น · รวม {list.reduce((n, o) => n + o.length, 0).toLocaleString("th-TH")} มม.</span>
            </h2>
            <ul className="divide-y divide-gray-100">
              {list.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
                  <span className="w-28 font-bold text-gray-900">{o.length.toLocaleString("th-TH")} มม.</span>
                  <span className="min-w-0 flex-1 text-xs text-gray-500">
                    {o.sourceName ? `จาก ${o.sourceName}` : "เพิ่มเอง"} · {formatThaiDateTime(o.createdAt)}
                  </span>
                  {o.reservedPlanId ? (
                    <Link href={`/steel-cutting/${o.reservedPlanId}`} className="rounded-full bg-orange-50 px-2 py-0.5 text-xs text-orange-700">
                      ใช้ในแผน {planName.get(o.reservedPlanId) ?? "?"}
                    </Link>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">ว่าง</span>
                  )}
                  <DeleteOffcutButton id={o.id} label={`${o.length} มม.`} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
