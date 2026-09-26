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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500">Summary of GMR inventory and budget</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {/* Total Budget Spent */}
        <div className="bg-white shadow-sm rounded-3xl border border-gray-100 p-4 sm:p-5">
          <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-orange-50 mb-3">
            <Wallet className="h-5 w-5 text-orange-600" />
          </div>
          <p className="text-xs font-medium text-gray-500 truncate">Total Budget Spent</p>
          <p className="text-lg font-bold text-gray-900 mt-0.5">
            ฿{totalBudgetSpent.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
          </p>
        </div>

        {/* Total Items */}
        <div className="bg-white shadow-sm rounded-3xl border border-gray-100 p-4 sm:p-5">
          <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-green-50 mb-3">
            <Package className="h-5 w-5 text-green-600" />
          </div>
          <p className="text-xs font-medium text-gray-500 truncate">Total Assets</p>
          <p className="text-lg font-bold text-gray-900 mt-0.5">
            {chartData.reduce((acc, curr) => acc + curr.count, 0)} items
          </p>
        </div>

        {/* Most Expensive Category */}
        <div className="bg-white shadow-sm rounded-3xl border border-gray-100 p-4 sm:p-5">
          <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-amber-50 mb-3">
            <TrendingUp className="h-5 w-5 text-amber-600" />
          </div>
          <p className="text-xs font-medium text-gray-500 truncate">Top Category by Value</p>
          <p className="text-lg font-bold text-gray-900 mt-0.5">
            {chartData.sort((a, b) => b.totalValue - a.totalValue)[0]?.status || "N/A"}
          </p>
        </div>

        {/* Car Bookings */}
        <Link
          href="/carbook"
          className="bg-white shadow-sm rounded-3xl border border-gray-100 p-4 sm:p-5 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all"
        >
          <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-purple-50 mb-3">
            <Car className="h-5 w-5 text-purple-600" />
          </div>
          <p className="text-xs font-medium text-gray-500 truncate">Upcoming Car Bookings</p>
          <p className="text-lg font-bold text-gray-900 mt-0.5">{upcomingBookings.length}</p>
          {isApprover && pendingBookingsCount > 0 && (
            <p className="mt-1 text-[11px] font-semibold text-red-600 flex items-center">
              <ShieldAlert className="w-3 h-3 mr-1" />
              {pendingBookingsCount} รออนุมัติ
            </p>
          )}
        </Link>
      </div>

      <div className="bg-white p-4 sm:p-6 shadow-sm rounded-3xl border border-gray-100">
        <h2 className="text-base font-bold text-gray-900 mb-4">Budget Distribution by Status (R B G Y)</h2>
        <div className="h-80">
          <DashboardCharts data={chartData} />
        </div>
      </div>

      <div className="bg-white shadow-sm rounded-3xl border border-gray-100 p-4 sm:p-6">
        <div className="flex items-center mb-3">
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-orange-50 mr-2">
            <HandHelping className="h-4 w-4 text-orange-600" />
          </span>
          <h2 className="text-sm font-bold text-gray-900">Currently Borrowed ({activeLoans.length})</h2>
        </div>
        {activeLoans.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8 bg-gray-50 rounded-2xl italic">ไม่มีของที่ถูกยืมอยู่ตอนนี้</p>
        ) : (
          <ul className="space-y-2">
            {activeLoans.map((loan) => {
              const isOverdue = isLoanOverdue(loan.dueDate);
              return (
                <li
                  key={loan.id}
                  className={`rounded-2xl border p-3 flex items-center gap-3 ${
                    isOverdue ? "border-red-100 bg-red-50/40" : "border-gray-100 bg-white"
                  }`}
                >
                  <span className="flex-shrink-0 w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center">
                    <Package className="w-[18px] h-[18px] text-orange-500" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-900 truncate">{loan.asset.name}</p>
                      {loan.dueDate && (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 ${
                            isOverdue ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {isOverdue && <AlertTriangle className="w-3 h-3 mr-1" />}
                          {formatThaiDate(loan.dueDate)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {loan.asset.modelOrSize} · {loan.quantity} {loan.asset.unit}
                    </p>
                    <div className="flex items-center justify-between gap-2 mt-1.5 flex-wrap">
                      <span className="text-xs text-gray-600">
                        <Link href={`/users/${loan.userId}`} className="hover:text-orange-600 font-medium">
                          {loan.user.nickname || loan.user.fullName || loan.user.username}
                        </Link>
                      </span>
                      <span className="inline-flex items-center text-[10px] text-gray-400">
                        <Clock className="w-3 h-3 mr-1" />
                        {formatThaiDateTime(loan.borrowedAt)}
                      </span>
                    </div>
                  </div>
                  {(isAdmin || loan.userId === currentUserId) && (
                    <div className="flex-shrink-0">
                      <ReturnLoanButton loanId={loan.id} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="bg-white shadow-sm rounded-3xl border border-gray-100 p-4 sm:p-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-50 mr-2">
              <Car className="h-4 w-4 text-purple-600" />
            </span>
            <h2 className="text-sm font-bold text-gray-900">Upcoming Car Bookings ({upcomingBookings.length})</h2>
          </div>
          <Link
            href="/carbook"
            className="text-xs font-semibold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-full px-2.5 py-1 transition-colors"
          >
            Go to Car Booking &rarr;
          </Link>
        </div>
        {upcomingBookings.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8 bg-gray-50 rounded-2xl italic">
            ไม่มีการจองรถที่อนุมัติแล้วในช่วงนี้
          </p>
        ) : (
          <ul className="space-y-2">
            {upcomingBookings.map((b) => (
              <li key={b.id} className="rounded-2xl border border-gray-100 bg-white p-3 flex items-center gap-3">
                <span className="flex-shrink-0 w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center">
                  <Car className="w-[18px] h-[18px] text-purple-500" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {b.vehicle.name} <span className="text-xs font-normal text-gray-400">{b.vehicle.licensePlate}</span>
                  </p>
                  <p className="text-xs text-gray-500 truncate">{b.purpose || "-"}</p>
                  <div className="flex items-center justify-between gap-2 mt-1.5 flex-wrap">
                    <Link href={`/users/${b.userId}`} className="text-xs text-gray-600 hover:text-orange-600 font-medium">
                      {b.user.nickname || b.user.fullName || b.user.username}
                    </Link>
                    <span className="inline-flex items-center text-[10px] text-gray-400">
                      <Clock className="w-3 h-3 mr-1" />
                      {formatThaiDateTime(b.startAt)} — {formatThaiDateTime(b.endAt)}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
