import { auth } from "@/auth";
import { getOtGrants } from "@/app/actions/ot";
import { formatThaiDateTime } from "@/lib/datetime";
import { Timer } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function OtPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" && session?.user?.role !== "OPERATOR") {
    return <div className="p-8 text-center text-red-600">Access Denied</div>;
  }

  const result = await getOtGrants();
  const grants = result.success && result.data ? result.data : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <Timer className="mr-2 h-6 w-6 text-orange-600" />
          OT
        </h1>
        <p className="text-gray-500">ประวัติการเปิด OT ทั้งหมด — สั่งผ่านไลน์ด้วยคำสั่ง &quot;เปิด OT&quot;</p>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">พนักงาน</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">ชั่วโมง</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">หมายเหตุ</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">เปิดโดย</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">เมื่อ</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {grants.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-500 italic">
                    ยังไม่มีการเปิด OT ในระบบ
                  </td>
                </tr>
              ) : (
                grants.map((g) => (
                  <tr key={g.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{g.employeeName}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-xs font-semibold">
                        +{g.hours} ชม.
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate" title={g.reason || undefined}>
                      {g.reason || <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{g.grantedByName}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-400">{formatThaiDateTime(g.createdAt)}</td>
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
