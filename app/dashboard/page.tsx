import { getDashboardStats } from "@/app/actions/assets";
import { getActiveLoans } from "@/app/actions/loans";
import { auth } from "@/auth";
import DashboardCharts from "@/components/DashboardCharts";
import ReturnLoanButton from "@/components/ReturnLoanButton";
import { Wallet, Package, TrendingUp, HandHelping, Clock } from "lucide-react";

export const dynamic = "force-dynamic";

interface ActiveLoan {
  id: string;
  quantity: number;
  borrowedAt: string;
  userId: string;
  asset: { name: string; modelOrSize: string; unit: string };
  user: { username: string; fullName: string | null };
}

export default async function DashboardPage() {
  const [result, loansResult, session] = await Promise.all([
    getDashboardStats(),
    getActiveLoans(),
    auth(),
  ]);

  if (!result.success || !result.data) {
    return <div>Error loading dashboard data</div>;
  }

  const { totalBudgetSpent, chartData } = result.data;
  const activeLoans: ActiveLoan[] = loansResult.success && loansResult.data ? loansResult.data : [];
  const currentUserId = session?.user?.id;
  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500">Summary of GMR inventory and budget</p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {/* Total Budget Spent */}
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-orange-500 rounded-md p-3">
                <Wallet className="h-6 w-6 text-white" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-700 truncate">Total Budget Spent</dt>
                  <dd>
                    <div className="text-lg font-medium text-gray-900">
                      ฿{totalBudgetSpent.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        {/* Total Items */}
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-green-500 rounded-md p-3">
                <Package className="h-6 w-6 text-white" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-700 truncate">Total Assets</dt>
                  <dd>
                    <div className="text-lg font-medium text-gray-900">
                      {chartData.reduce((acc, curr) => acc + curr.count, 0)} items
                    </div>
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        {/* Most Expensive Category */}
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-yellow-500 rounded-md p-3">
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-700 truncate">Top Category by Value</dt>
                  <dd>
                    <div className="text-lg font-medium text-gray-900">
                      {chartData.sort((a, b) => b.totalValue - a.totalValue)[0]?.status || "N/A"}
                    </div>
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 shadow rounded-lg">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Budget Distribution by Status (R B G Y)</h2>
        <div className="h-80">
          <DashboardCharts data={chartData} />
        </div>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center">
          <HandHelping className="h-5 w-5 text-orange-600 mr-2" />
          <h2 className="text-sm font-semibold text-gray-900">
            Currently Borrowed ({activeLoans.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Asset</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Borrowed By</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Quantity</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Borrowed At</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {activeLoans.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-500 italic">
                    ไม่มีของที่ถูกยืมอยู่ตอนนี้
                  </td>
                </tr>
              ) : (
                activeLoans.map((loan) => (
                  <tr key={loan.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{loan.asset.name}</div>
                      <div className="text-xs text-gray-500">{loan.asset.modelOrSize}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {loan.user.fullName || loan.user.username}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {loan.quantity} {loan.asset.unit}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-400">
                      <span className="flex items-center">
                        <Clock className="w-3 h-3 mr-1" />
                        {new Date(loan.borrowedAt).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      {(isAdmin || loan.userId === currentUserId) && (
                        <ReturnLoanButton loanId={loan.id} />
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
