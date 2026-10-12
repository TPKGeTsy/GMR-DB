import Link from "next/link";
import { auth } from "@/auth";
import { getLaborHistory } from "@/app/actions/laborHire";
import LaborPaymentBadge from "@/components/LaborPaymentBadge";
import { canManageUsers } from "@/lib/roles";
import { bangkokDateKey, formatThaiDateLong } from "@/lib/datetime";
import {
  contractLabel,
  hireTypeLabel,
  workerRoleLabel,
  normalizeName,
  type DirectoryHire,
  type VendorEntry,
  type VendorJob,
} from "@/lib/laborHire";
import {
  History, Building2, User, ChevronDown, Search, Wallet, BadgeCheck, HardHat, Users, CalendarDays, Phone, MapPin,
  FolderKanban, ArrowLeft,
} from "lucide-react";

export const dynamic = "force-dynamic";

const baht = (n: number) => `฿${n.toLocaleString("th-TH")}`;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function StatTile({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  return (
    <div className="bg-white shadow-sm rounded-3xl border border-gray-100 p-4">
      <div className={`flex items-center justify-center w-10 h-10 rounded-2xl mb-2 ${tone}`}>{icon}</div>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="text-lg font-bold text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}

function JobCard({ job, hire }: { job: VendorJob; hire: DirectoryHire }) {
  const namedTech = hire.workers.filter((w) => w.role === "TECHNICIAN").length;
  const namedLabor = hire.workers.filter((w) => w.role === "LABORER").length;
  const unnamedTech = Math.max(0, hire.technicianCount - namedTech);
  const unnamedLabor = Math.max(0, hire.laborerCount - namedLabor);
  const me = job.worker;

  return (
    <li className="rounded-2xl border border-gray-100 bg-white p-3">
      <div>
        <p className="text-sm font-semibold text-gray-900 break-words">{hire.title}</p>
        <p className="text-[11px] text-gray-400">{formatThaiDateLong(hire.dateKey)}</p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
            <CalendarDays className="w-3 h-3" />
            {contractLabel(hire.contractType, hire.days)}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full">
            <Wallet className="w-3 h-3" />
            {baht(hire.cost)}
          </span>
          <LaborPaymentBadge cost={hire.cost} paidAmount={hire.paidAmount} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-2 text-xs text-gray-500">
        <span>
          ผู้รับผิดชอบ: <span className="font-medium text-gray-700">{hire.responsibleName}</span>
        </span>
        {!job.asVendor && hire.vendorName && (
          <span className="inline-flex items-center gap-1">
            <Building2 className="w-3 h-3 text-gray-400" />
            จ้างผ่าน {hire.vendorName}
          </span>
        )}
        {hire.location && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="w-3 h-3 text-gray-400" />
            {hire.location}
          </span>
        )}
        {hire.projectName && hire.projectId && (
          <Link href={`/projects/${hire.projectId}`} className="inline-flex items-center gap-1 hover:text-orange-600">
            <FolderKanban className="w-3 h-3 text-gray-400" />
            {hire.projectName}
          </Link>
        )}
        <span className="text-gray-400">{hireTypeLabel[hire.hireType]}</span>
      </div>

      {/* This person's own agreement on the job. */}
      {!job.asVendor && me && (
        <p className="mt-2 text-xs rounded-xl bg-purple-50 text-purple-800 px-2.5 py-1.5">
          {workerRoleLabel[me.role]} ·{" "}
          {me.dailyRate !== null ? (
            <>
              ค่าแรงที่ตกลง <span className="font-semibold">{baht(me.dailyRate)}/วัน</span> × {hire.days} วัน ={" "}
              <span className="font-semibold">{baht(me.dailyRate * hire.days)}</span>
            </>
          ) : (
            "ไม่ได้ระบุค่าแรงที่ตกลง"
          )}
        </p>
      )}

      {/* The whole crew on a job where this company was the contractor. */}
      {job.asVendor && (
        <div className="mt-2 rounded-xl bg-gray-50 px-2.5 py-2 space-y-1">
          <p className="text-[11px] font-semibold text-gray-500">
            ช่าง {hire.technicianCount} คน · คนงาน {hire.laborerCount} คน
            {hire.rateMode === "DAILY_RATE" &&
              ` · อัตรากลาง${hire.technicianRate !== null ? ` ช่าง ${baht(hire.technicianRate)}` : ""}${
                hire.laborerRate !== null ? ` คนงาน ${baht(hire.laborerRate)}` : ""
              }/วัน`}
          </p>
          {hire.workers.length > 0 ? (
            <ul className="space-y-0.5">
              {hire.workers.map((w) => (
                <li key={w.name} className="flex items-center justify-between gap-2 text-xs text-gray-600">
                  <span className="truncate">
                    {w.name} <span className="text-gray-400">· {workerRoleLabel[w.role]}</span>
                  </span>
                  <span className="flex-shrink-0 font-medium text-gray-700">
                    {w.dailyRate !== null ? `${baht(w.dailyRate)}/วัน` : "—"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-gray-400">ไม่ได้ระบุรายชื่อ</p>
          )}
          {(unnamedTech > 0 || unnamedLabor > 0) && hire.workers.length > 0 && (
            <p className="text-[11px] text-gray-400">
              ไม่ระบุชื่อ:{unnamedTech > 0 && ` ช่าง ${unnamedTech} คน`}
              {unnamedLabor > 0 && ` คนงาน ${unnamedLabor} คน`}
            </p>
          )}
        </div>
      )}
      {hire.note && <p className="text-xs text-gray-400 italic mt-1.5">{hire.note}</p>}
    </li>
  );
}

/** Everyone who ever worked on this company's jobs, with their latest
 *  agreed rate — "มีชื่อใครบ้าง". */
function CompanyCrew({ entry, hires }: { entry: VendorEntry; hires: Record<string, DirectoryHire> }) {
  const people = new Map<string, { name: string; role: string; rate: number | null; times: number }>();
  for (const job of entry.jobs) {
    if (!job.asVendor) continue;
    for (const w of hires[job.hireId]?.workers ?? []) {
      const key = normalizeName(w.name);
      const prev = people.get(key);
      if (prev) prev.times += 1;
      else people.set(key, { name: w.name, role: workerRoleLabel[w.role], rate: w.dailyRate, times: 1 }); // jobs are newest-first
    }
  }
  if (people.size === 0) return null;

  return (
    <div className="mb-3 rounded-2xl bg-purple-50/60 border border-purple-100 p-3">
      <p className="text-xs font-semibold text-purple-800 mb-1.5">รายชื่อที่เคยมากับบริษัทนี้ ({people.size} คน)</p>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
        {[...people.values()].map((p) => (
          <li key={p.name} className="flex items-center justify-between gap-2 text-xs text-gray-700">
            <span className="truncate">
              {p.name} <span className="text-gray-400">· {p.role} · {p.times} งาน</span>
            </span>
            <span className="flex-shrink-0 font-medium">{p.rate !== null ? `${baht(p.rate)}/วัน` : "—"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function LaborHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string; q?: string }>;
}) {
  const session = await auth();
  if (!canManageUsers(session?.user?.role)) {
    return <div className="p-8 text-center text-red-600">Access Denied</div>;
  }

  const { asOf: asOfParam, q } = await searchParams;
  const today = bangkokDateKey(new Date());
  const asOf = asOfParam && DATE_KEY.test(asOfParam) ? asOfParam : today;
  const query = (q ?? "").trim().slice(0, 100);

  const result = await getLaborHistory({ asOf, q: query });
  if (!result.success) {
    return <div className="p-8 text-center bg-red-50 text-red-700 rounded-lg">{result.error || "โหลดข้อมูลไม่สำเร็จ"}</div>;
  }
  const { entries, hires, totals, truncated } = result.data;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link href="/labor-hire" className="inline-flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 font-medium mb-2">
          <ArrowLeft className="w-3.5 h-3.5" />
          กลับไปหน้ารายการจ้าง
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <span className="flex items-center justify-center w-9 h-9 rounded-full bg-orange-50 mr-2.5">
            <History className="h-5 w-5 text-orange-600" />
          </span>
          ประวัติการ Consult / จ้างงาน
        </h1>
        <p className="text-gray-500 ml-[46px]">
          เคยจ้างบริษัทหรือบุคคลไหน งบรวมเท่าไหร่ กดที่แถบเพื่อดูงาน รายชื่อ และค่าแรงที่ตกลงกัน
        </p>
      </div>

      <form method="get" className="bg-white shadow-sm rounded-3xl border border-gray-100 p-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="asOf" className="block text-[11px] text-gray-400 mb-1">
            ณ วันที่ (นับงานถึงวันนี้)
          </label>
          <input
            id="asOf"
            name="asOf"
            type="date"
            defaultValue={asOf}
            className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
          />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label htmlFor="q" className="block text-[11px] text-gray-400 mb-1">
            ค้นหาชื่อบริษัท/บุคคล
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={query}
              placeholder="พิมพ์ส่วนหนึ่งของชื่อก็ได้"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
            />
          </div>
        </div>
        <button
          type="submit"
          className="px-5 py-2 rounded-full bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 active:bg-orange-800 shadow-sm shadow-orange-200 transition-colors"
        >
          ค้นหา
        </button>
      </form>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          icon={<Wallet className="w-5 h-5 text-green-600" />}
          tone="bg-green-50"
          label={`งบรวม ณ ${formatThaiDateLong(asOf)}`}
          value={baht(totals.budget)}
        />
        <StatTile icon={<BadgeCheck className="w-5 h-5 text-emerald-600" />} tone="bg-emerald-50" label="จ่ายแล้ว" value={baht(totals.paid)} />
        <StatTile icon={<HardHat className="w-5 h-5 text-purple-600" />} tone="bg-purple-50" label="จำนวนงานที่จ้าง" value={`${totals.jobs} งาน`} />
        <StatTile icon={<Users className="w-5 h-5 text-blue-600" />} tone="bg-blue-50" label={query ? "ที่ตรงกับคำค้น" : "บริษัท/บุคคลที่เคยจ้าง"} value={`${totals.entries} ราย`} />
      </div>

      {truncated && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2">
          แสดงเฉพาะงานล่าสุดบางส่วน (ข้อมูลเยอะเกินกว่าจะแสดงทั้งหมดในหน้าเดียว) — ลองเลือก &quot;ณ วันที่&quot; ให้เร็วขึ้นเพื่อดูย้อนหลัง
        </p>
      )}

      {entries.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-12 bg-white rounded-3xl border border-gray-100 shadow-sm">
          {query ? `ไม่พบประวัติที่ตรงกับ "${query}"` : "ยังไม่มีประวัติการจ้าง"}
        </p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.key}>
              <details className="group bg-white shadow-sm rounded-3xl border border-gray-100 open:border-orange-200 transition-colors">
                <summary className="list-none cursor-pointer select-none flex items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
                  <span
                    className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center ${
                      entry.kind === "COMPANY" ? "bg-blue-50 text-blue-600" : "bg-purple-50 text-purple-600"
                    }`}
                  >
                    {entry.kind === "COMPANY" ? <Building2 className="w-5 h-5" /> : <User className="w-5 h-5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-gray-900 truncate">{entry.name}</span>
                    <span className="block text-[11px] text-gray-500">
                      {entry.kind === "COMPANY" ? "บริษัท/ผู้รับเหมา" : "บุคคล"} · เคยจ้าง {entry.times} ครั้ง · ล่าสุด{" "}
                      {formatThaiDateLong(entry.lastDateKey)}
                    </span>
                    {(entry.phone || entry.trade || (entry.kind === "PERSON" && entry.lastRole)) && (
                      <span className="block text-[11px] text-gray-400 truncate">
                        {entry.phone && (
                          <span className="inline-flex items-center gap-0.5">
                            <Phone className="w-3 h-3" />
                            {entry.phone}
                          </span>
                        )}
                        {[
                          entry.kind === "PERSON" && entry.lastRole ? workerRoleLabel[entry.lastRole] : null,
                          entry.trade,
                        ]
                          .filter(Boolean)
                          .map((part, i) => (
                            <span key={i}>
                              {(entry.phone || i > 0) && " · "}
                              {part}
                            </span>
                          ))}
                      </span>
                    )}
                  </span>
                  <span className="flex-shrink-0 text-right">
                    <span className="block text-base font-bold text-gray-900">
                      {entry.totalCost !== null ? baht(entry.totalCost) : "—"}
                    </span>
                    <span className="block text-[10px] text-gray-400">
                      {entry.kind === "COMPANY" ? "งบรวม" : "ค่าแรงตามที่ตกลง"}
                    </span>
                  </span>
                  <ChevronDown className="flex-shrink-0 w-4 h-4 text-gray-400 transition-transform group-open:rotate-180" />
                </summary>

                <div className="px-4 pb-4">
                  {entry.kind === "COMPANY" && <CompanyCrew entry={entry} hires={hires} />}
                  <ul className="space-y-2">
                    {entry.jobs.map((job) => {
                      const hire = hires[job.hireId];
                      return hire ? <JobCard key={job.hireId} job={job} hire={hire} /> : null;
                    })}
                  </ul>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
