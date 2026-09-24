import { getDashboardStats } from "@/app/actions/assets";
import { getActiveLoans } from "@/app/actions/loans";
import { getUpcomingBookings, getPendingBookingsCount } from "@/app/actions/carbooking";
import { auth } from "@/auth";
import DashboardCharts from "@/components/DashboardCharts";
import ReturnLoanButton from "@/components/ReturnLoanButton";
import Link from "next/link";
import { Wallet, Package, TrendingUp, HandHelping, Clock, AlertTriangle, Car, ShieldAlert } from "lucide-react";
import { isLoanOverdue } from "@/lib/loans";
import { formatThaiDate, formatThaiDateTime } from "@/lib/datetime";

export const dynamic = "force-dynamic";

interface ActiveLoan {
  id: string;
  quantity: number;
  borrowedAt: string;
  dueDate: string | null;
  userId: string;
  asset: { name: string; modelOrSize: string; unit: string };
  user: { username: string; fullName: string | null; nickname: string | null };
}

interface UpcomingBooking {
  id: string;
  userId: string;
  startAt: string;
  endAt: string;
  purpose: string | null;
  vehicle: { name: string; licensePlate: string };
  user: { username: string; fullName: string | null; nickname: string | null };
}

export default async function DashboardPage() {
  const [result, loansResult, bookingsResult, pendingCountResult, session] = await Promise.all([
    getDashboardStats(),
    getActiveLoans(),
    getUpcomingBookings(),
    getPendingBookingsCount(),
    auth(),
  ]);

  if (!result.success || !result.data) {
    return <div>Error loading dashboard data</div>;
  }

  const { totalBudgetSpent, chartData } = result.data;
  const activeLoans: ActiveLoan[] = loansResult.success && loansResult.data ? loansResult.data : [];
  const upcomingBookings: UpcomingBooking[] = bookingsResult.success && bookingsResult.data ? bookingsResult.data : [];
  const pendingBookingsCount = pendingCountResult.success ? pendingCountResult.data : 0;
  const currentUserId = session?.user?.id;
  const isAdmin = session?.user?.role === "ADMIN";
  const isApprover = session?.user?.role === "ADMIN" || session?.user?.role === "OPERATOR";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500">Summary of GMR inventory and budget</p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
                      ฿{totalBudgetSpent.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
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

        {/* Car Bookings */}
        <Link href="/carbook" className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-purple-500 rounded-md p-3">
                <Car className="h-6 w-6 text-white" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-700 truncate">Upcoming Car Bookings</dt>
                  <dd>
                    <div className="text-lg font-medium text-gray-900">{upcomingBookings.length}</div>
                  </dd>
                </dl>
                {isApprover && pendingBookingsCount > 0 && (
                  <p className="mt-1 text-xs font-semibold text-red-600 flex items-center">
                    <ShieldAlert className="w-3 h-3 mr-1" />
                    {pendingBookingsCount} รออนุมัติ
                  </p>
                )}
              </div>
            </div>
          </div>
        </Link>
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Due</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {activeLoans.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-500 italic">
                    ไม่มีของที่ถูกยืมอยู่ตอนนี้
                  </td>
                </tr>
              ) : (
                activeLoans.map((loan) => {
                  const isOverdue = isLoanOverdue(loan.dueDate);
                  return (
                    <tr key={loan.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{loan.asset.name}</div>
                        <div className="text-xs text-gray-500">{loan.asset.modelOrSize}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        <Link href={`/users/${loan.userId}`} className="hover:text-orange-600">
                          {loan.user.nickname || loan.user.fullName || loan.user.username}
                        </Link>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {loan.quantity} {loan.asset.unit}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-400">
                        <span className="flex items-center">
                          <Clock className="w-3 h-3 mr-1" />
                          {formatThaiDateTime(loan.borrowedAt)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs">
                        {loan.dueDate && (
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full font-semibold ${
                            isOverdue ? "bg-red-100 text-red-700" : "text-gray-400"
                          }`}>
                            {isOverdue && <AlertTriangle className="w-3 h-3 mr-1" />}
                            {formatThaiDate(loan.dueDate)}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        {(isAdmin || loan.userId === currentUserId) && (
                          <ReturnLoanButton loanId={loan.id} />
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <div className="flex items-center">
            <Car className="h-5 w-5 text-orange-600 mr-2" />
            <h2 className="text-sm font-semibold text-gray-900">
              Upcoming Car Bookings ({upcomingBookings.length})
            </h2>
          </div>
          <Link href="/carbook" className="text-xs font-medium text-orange-600 hover:text-orange-700">
            Go to Car Booking &rarr;
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Vehicle</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Booked By</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Purpose</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Time</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {upcomingBookings.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-sm text-gray-500 italic">
                    ไม่มีการจองรถที่อนุมัติแล้วในช่วงนี้
                  </td>
                </tr>
              ) : (
                upcomingBookings.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{b.vehicle.name}</div>
                      <div className="text-xs text-gray-500">{b.vehicle.licensePlate}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      <Link href={`/users/${b.userId}`} className="hover:text-orange-600">
                        {b.user.nickname || b.user.fullName || b.user.username}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{b.purpose || "-"}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-400">
                      <span className="flex items-center">
                        <Clock className="w-3 h-3 mr-1" />
                        {formatThaiDateTime(b.startAt)} — {formatThaiDateTime(b.endAt)}
                      </span>
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
