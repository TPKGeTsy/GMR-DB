import { auth } from "@/auth";
import { getOtSummary } from "@/app/actions/ot";
import OtSummaryFilters from "@/components/OtSummaryFilters";
import { isOtManagerRole } from "@/lib/roles";
import { BarChart3 } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function OtSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await auth();
  if (!isOtManagerRole(session?.user?.role)) {
    return <div className="p-8 text-center text-red-600">Access Denied</div>;
  }

  const { from, to } = await searchParams;
  const result = await getOtSummary({ from, to });
  const rows = result.success && result.data ? result.data : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <BarChart3 className="mr-2 h-6 w-6 text-orange-600" />
          สรุป OT (OT Summary)
        </h1>
        <p className="text-gray-500">
          จำนวนวันทำงานและชั่วโมง OT รวมของแต่ละคน — เลือกช่วงวันที่ด้านล่างเพื่อกรอง (ค่าเริ่มต้นคือทั้งหมด)
        </p>
      </div>

      <OtSummaryFilters />

      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">พนักงาน</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">วันทำงาน</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">ชั่วโมงรวม</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">OT รวม (คำนวณ)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">OT ที่อนุมัติแล้ว</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">🍚 วันได้ข้าว (OT&gt;3ชม.)</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-500 italic">
                    ไม่มีข้อมูลในช่วงวันที่นี้
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.userId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      <Link href={`/users/${r.userId}`} className="hover:text-orange-600">
                        {r.employeeName}
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{r.daysWorked} วัน</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{r.totalHours.toFixed(1)} ชม.</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {r.totalOtHours > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-xs font-semibold">
                          +{r.totalOtHours.toFixed(1)} ชม.
                        </span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {r.formalOtHours > 0 ? `${r.formalOtHours.toFixed(1)} ชม.` : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {r.mealEligibleDays > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
                          🍚 {r.mealEligibleDays} วัน
                        </span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
