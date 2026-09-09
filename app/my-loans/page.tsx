import { getMyLoans } from "@/app/actions/loans";
import ReturnLoanButton from "@/components/ReturnLoanButton";
import { PackageCheck, Clock, AlertTriangle } from "lucide-react";
import Image from "next/image";
import { isLoanOverdue } from "@/lib/loans";

export const dynamic = "force-dynamic";

interface LoanRow {
  id: string;
  quantity: number;
  borrowedAt: string;
  dueDate: string | null;
  returnedAt: string | null;
  asset: {
    name: string;
    modelOrSize: string;
    unit: string;
    imageUrl: string | null;
  };
}

export default async function MyLoansPage() {
  const result = await getMyLoans();
  const loans: LoanRow[] = result.success && result.data ? result.data : [];

  const active = loans.filter((l) => !l.returnedAt);
  const history = loans.filter((l) => l.returnedAt);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <PackageCheck className="mr-2 h-6 w-6 text-orange-600" />
          รายการยืม-คืนของฉัน
        </h1>
        <p className="text-gray-500">อุปกรณ์ที่คุณยืมอยู่ และประวัติการคืนของ</p>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
          กำลังยืมอยู่ ({active.length})
        </h2>
        {active.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-200 rounded-lg py-10 text-center text-sm text-gray-400">
            ไม่มีของที่ค้างยืมอยู่ตอนนี้
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {active.map((loan) => {
              const isOverdue = isLoanOverdue(loan.dueDate);
              return (
                <div key={loan.id} className={`bg-white border rounded-lg shadow-sm p-4 flex gap-3 ${isOverdue ? "border-red-200" : "border-gray-100"}`}>
                  <div className="w-14 h-14 flex-shrink-0 bg-gray-50 rounded-md overflow-hidden flex items-center justify-center">
                    {loan.asset.imageUrl ? (
                      <Image src={loan.asset.imageUrl} alt={loan.asset.name} width={56} height={56} className="object-contain" />
                    ) : (
                      <PackageCheck className="w-6 h-6 text-gray-300" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{loan.asset.name}</p>
                    <p className="text-xs text-gray-500 mb-1">
                      {loan.quantity} {loan.asset.unit}
                    </p>
                    <p className="text-[10px] text-gray-400 flex items-center mb-1">
                      <Clock className="w-3 h-3 mr-1" />
                      ยืมเมื่อ {new Date(loan.borrowedAt).toLocaleString("th-TH")}
                    </p>
                    {loan.dueDate && (
                      <p className={`text-[10px] flex items-center mb-2 ${isOverdue ? "text-red-600 font-semibold" : "text-gray-400"}`}>
                        {isOverdue && <AlertTriangle className="w-3 h-3 mr-1" />}
                        {isOverdue ? "เกินกำหนดคืนแล้ว: " : "กำหนดคืน: "}
                        {new Date(loan.dueDate).toLocaleDateString("th-TH")}
                      </p>
                    )}
                    <ReturnLoanButton loanId={loan.id} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
          ประวัติการคืนของ
        </h2>
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">อุปกรณ์</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">จำนวน</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">ยืมเมื่อ</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">คืนเมื่อ</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-10 text-center text-sm text-gray-500 italic">
                      ยังไม่มีประวัติการคืนของ
                    </td>
                  </tr>
                ) : (
                  history.map((loan) => (
                    <tr key={loan.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{loan.asset.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{loan.quantity} {loan.asset.unit}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(loan.borrowedAt).toLocaleString("th-TH")}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{loan.returnedAt && new Date(loan.returnedAt).toLocaleString("th-TH")}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
