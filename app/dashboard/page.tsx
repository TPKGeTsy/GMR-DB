import { getDashboardStats } from "@/app/actions/assets";
import DashboardCharts from "@/components/DashboardCharts";
import { Wallet, Package, TrendingUp } from "lucide-react";

export default async function DashboardPage() {
  const result = await getDashboardStats();

  if (!result.success || !result.data) {
    return <div>Error loading dashboard data</div>;
  }

  const { totalBudgetSpent, chartData } = result.data;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-700">Summary of your inventory and budget</p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {/* Total Budget Spent */}
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-indigo-500 rounded-md p-3">
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
        <h2 className="text-lg font-medium text-gray-900 mb-4">Budget Distribution by Status (R vs Y)</h2>
        <div className="h-80">
          <DashboardCharts data={chartData} />
        </div>
      </div>
    </div>
  );
}
