import { auth } from "@/auth";
import { getWageGrades, getWageReport } from "@/app/actions/wages";
import WageGradesPanel from "@/components/WageGradesPanel";
import WageReportFilters from "@/components/WageReportFilters";
import WageReportTable from "@/components/WageReportTable";
import { bangkokDateKey } from "@/lib/datetime";
import { Wallet } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function WagesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return <div className="p-8 text-center text-red-600">Access Denied</div>;
  }

  const { from, to } = await searchParams;
  const today = bangkokDateKey(new Date());
  const defaultFrom = `${today.slice(0, 7)}-01`; // start of this month
  const rangeFrom = from || defaultFrom;
  const rangeTo = to || today;

  const [gradesResult, reportResult] = await Promise.all([
    getWageGrades(),
    getWageReport({ from: rangeFrom, to: rangeTo }),
  ]);

  const grades = gradesResult.success && gradesResult.data ? gradesResult.data : [];
  const report = reportResult.success && reportResult.data ? reportResult.data : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <Wallet className="mr-2 h-6 w-6 text-orange-600" />
          ค่าแรงเด็กฝึกงาน (Wages)
        </h1>
        <p className="text-gray-500">คำนวณค่าแรงรายวันตามเกรดและสถานที่ทำงาน</p>
      </div>

      <WageGradesPanel initial={grades} />

      <div className="bg-white shadow rounded-lg border border-gray-100 overflow-hidden">
        <div className="p-6 pb-0">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">รายงานค่าแรง</h2>
          <WageReportFilters defaultFrom={defaultFrom} defaultTo={today} />
        </div>
        <WageReportTable rows={report} />
      </div>
    </div>
  );
}
