import { auth } from "@/auth";
import { getLaborHires, getLaborHireOptions } from "@/app/actions/laborHire";
import LaborHireManager from "@/components/LaborHireManager";
import WageReportFilters from "@/components/WageReportFilters";
import { canManageUsers } from "@/lib/roles";
import { bangkokDateKey } from "@/lib/datetime";
import { HardHat, History } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function LaborHirePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await auth();
  if (!canManageUsers(session?.user?.role)) {
    return <div className="p-8 text-center text-red-600">Access Denied</div>;
  }

  const { from, to } = await searchParams;
  const today = bangkokDateKey(new Date());
  const defaultFrom = `${today.slice(0, 7)}-01`;
  const rangeFrom = from || defaultFrom;
  const rangeTo = to || today;

  const [rowsResult, optionsResult] = await Promise.all([
    getLaborHires({ from: rangeFrom, to: rangeTo }),
    getLaborHireOptions(),
  ]);

  if (!rowsResult.success || !optionsResult.success) {
    return (
      <div className="p-8 text-center bg-red-50 text-red-700 rounded-lg">
        {(!rowsResult.success && rowsResult.error) || (!optionsResult.success && optionsResult.error) || "โหลดข้อมูลไม่สำเร็จ"}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
       <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <span className="flex items-center justify-center w-9 h-9 rounded-full bg-orange-50 mr-2.5">
            <HardHat className="h-5 w-5 text-orange-600" />
          </span>
          Consult: ช่าง/คนงานนอก
        </h1>
        <p className="text-gray-500 ml-[46px]">
          บันทึกว่าใครเป็นผู้รับผิดชอบการจ้างช่างหรือคนงานนอก จ้างมากี่คน และค่าใช้จ่ายเท่าไหร่
        </p>
       </div>
        <Link
          href="/labor-hire/history"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 active:bg-gray-100 shadow-sm transition-colors"
        >
          <History className="w-4 h-4 text-orange-600" />
          ประวัติการจ้าง
        </Link>
      </div>

      <WageReportFilters defaultFrom={defaultFrom} defaultTo={today} />

      <LaborHireManager rows={rowsResult.data} options={optionsResult.data} defaultDateKey={today} />
    </div>
  );
}
