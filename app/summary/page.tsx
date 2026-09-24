import { auth } from "@/auth";
import { getMealOtSummary } from "@/app/actions/summary";
import WageReportFilters from "@/components/WageReportFilters";
import { bangkokDateKey } from "@/lib/datetime";
import { formatHoursTenths } from "@/lib/attendance";
import { Utensils, Timer, BarChart3 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SummaryPage({
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

  const result = await getMealOtSummary({ from: rangeFrom, to: rangeTo });
  const rows = result.success && result.data ? result.data : [];

  const grandTotalOt = rows.reduce((sum, r) => sum + r.totalOtHours, 0);
  const grandTotalMeals = rows.reduce((sum, r) => sum + r.mealDays, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <BarChart3 className="mr-2 h-6 w-6 text-orange-600" />
          สรุปมื้อ + OT
        </h1>
        <p className="text-gray-500">สรุปจำนวนมื้อสะสมและชั่วโมง OT รวมของแต่ละคนในช่วงเวลาที่เลือก</p>
      </div>

      <div className="bg-white shadow rounded-lg border border-gray-100 overflow-hidden">
        <div className="p-6 pb-0">
          <WageReportFilters defaultFrom={defaultFrom} defaultTo={today} />
        </div>

        {rows.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-gray-400 italic">ไม่มีข้อมูลในช่วงนี้</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-[10px] font-medium text-gray-700 uppercase tracking-wider">พนักงาน</th>
                  <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-700 uppercase tracking-wider">วันทำงาน</th>
                  <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-700 uppercase tracking-wider">
                    <span className="inline-flex items-center gap-1">
                      <Utensils className="w-3 h-3" />
                      มื้อสะสม
                    </span>
                  </th>
                  <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-700 uppercase tracking-wider">
                    <span className="inline-flex items-center gap-1">
                      <Timer className="w-3 h-3" />
                      OT (ชม.)
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {rows.map((row) => (
                  <tr key={row.userId} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm font-medium text-gray-900">{row.employeeName}</td>
                    <td className="px-4 py-2 text-right text-sm text-gray-700">{row.totalDays}</td>
                    <td className="px-4 py-2 text-right text-sm text-gray-700">{row.mealDays}</td>
                    <td className="px-4 py-2 text-right text-sm font-semibold text-orange-600">{formatHoursTenths(row.totalOtHours)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td colSpan={2} className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    รวมทั้งหมด
                  </td>
                  <td className="px-4 py-2 text-right text-sm font-bold text-gray-900">{grandTotalMeals}</td>
                  <td className="px-4 py-2 text-right text-sm font-bold text-orange-600">{formatHoursTenths(grandTotalOt)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
