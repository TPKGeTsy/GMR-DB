import { auth } from "@/auth";
import { getVehicles } from "@/app/actions/vehicles";
import { getMyBookings, getPendingBookings, getUpcomingBookings } from "@/app/actions/carbooking";
import VehicleBookingCard from "@/components/VehicleBookingCard";
import BookingApprovalButtons from "@/components/BookingApprovalButtons";
import CancelBookingButton from "@/components/CancelBookingButton";
import Link from "next/link";
import { Car, Plus, Clock, CalendarClock, ShieldAlert, CheckCircle2 } from "lucide-react";
import { formatThaiDateTime } from "@/lib/datetime";

export const dynamic = "force-dynamic";

interface Vehicle {
  id: string;
  name: string;
  licensePlate: string;
  imageUrl: string | null;
  status: string;
}

interface MyBooking {
  id: string;
  startAt: string;
  endAt: string;
  purpose: string | null;
  status: string;
  vehicle: { name: string; licensePlate: string };
}

interface PendingBooking {
  id: string;
  userId: string;
  startAt: string;
  endAt: string;
  purpose: string | null;
  createdAt: string;
  vehicle: { name: string; licensePlate: string };
  user: { username: string; fullName: string | null; nickname: string | null };
}

const statusBadge: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};

const statusLabel: Record<string, string> = {
  PENDING: "รออนุมัติ",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ถูกปฏิเสธ",
  CANCELLED: "ยกเลิกแล้ว",
};

export default async function CarBookingPage() {
  const session = await auth();
  const isLoggedIn = !!session?.user;
  const isApprover = session?.user?.role === "ADMIN" || session?.user?.role === "OPERATOR";

  const [vehiclesResult, myBookingsResult, pendingResult, upcomingResult] = await Promise.all([
    getVehicles(),
    isLoggedIn ? getMyBookings() : Promise.resolve({ success: false as const, data: undefined }),
    isApprover ? getPendingBookings() : Promise.resolve({ success: false as const, data: undefined }),
    isLoggedIn ? getUpcomingBookings() : Promise.resolve({ success: false as const, data: undefined }),
  ]);

  const vehicles: Vehicle[] = vehiclesResult.success && vehiclesResult.data ? vehiclesResult.data : [];
  const myBookings: MyBooking[] = myBookingsResult.success && myBookingsResult.data ? myBookingsResult.data : [];
  const pendingBookings: PendingBooking[] = pendingResult.success && pendingResult.data ? pendingResult.data : [];
  const upcomingCount: number = upcomingResult.success && upcomingResult.data ? upcomingResult.data.length : 0;
  const availableCount = vehicles.filter((v) => v.status === "AVAILABLE").length;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <Car className="mr-2 h-6 w-6 text-orange-600" />
            Car Booking
          </h1>
          <p className="text-gray-500">จองรถส่วนกลางสำหรับใช้งาน — ต้องได้รับอนุมัติจาก Operator หรือ Admin ก่อน</p>
        </div>
        {isApprover && (
          <Link
            href="/carbook/new"
            className="inline-flex items-center px-4 py-2 rounded-md text-white bg-orange-600 hover:bg-orange-700 font-medium text-sm shadow-sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Vehicle
          </Link>
        )}
      </div>

      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${isApprover ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        <div className="bg-white overflow-hidden shadow rounded-lg p-5 flex items-center">
          <div className="flex-shrink-0 bg-gray-700 rounded-md p-3">
            <Car className="h-5 w-5 text-white" />
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-700">รถทั้งหมด</p>
            <p className="text-lg font-medium text-gray-900">{vehicles.length} คัน</p>
          </div>
        </div>
        <div className="bg-white overflow-hidden shadow rounded-lg p-5 flex items-center">
          <div className="flex-shrink-0 bg-green-500 rounded-md p-3">
            <CheckCircle2 className="h-5 w-5 text-white" />
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-700">พร้อมใช้งานตอนนี้</p>
            <p className="text-lg font-medium text-gray-900">{availableCount} คัน</p>
          </div>
        </div>
        <div className="bg-white overflow-hidden shadow rounded-lg p-5 flex items-center">
          <div className="flex-shrink-0 bg-orange-500 rounded-md p-3">
            <CalendarClock className="h-5 w-5 text-white" />
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-700">การจองที่อนุมัติแล้ว (กำลังจะถึง)</p>
            <p className="text-lg font-medium text-gray-900">{upcomingCount} รายการ</p>
          </div>
        </div>
        {isApprover && (
          <div className="bg-white overflow-hidden shadow rounded-lg p-5 flex items-center">
            <div className="flex-shrink-0 bg-red-500 rounded-md p-3">
              <ShieldAlert className="h-5 w-5 text-white" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-700">รออนุมัติ</p>
              <p className="text-lg font-medium text-gray-900">{pendingBookings.length} รายการ</p>
            </div>
          </div>
        )}
      </div>

      {isApprover && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center">
            <ShieldAlert className="w-4 h-4 mr-1.5 text-orange-600" />
            รออนุมัติ ({pendingBookings.length})
          </h2>
          {pendingBookings.length === 0 ? (
            <div className="bg-white border border-dashed border-gray-200 rounded-lg py-8 text-center text-sm text-gray-400">
              ไม่มีคำขอจองรอดำเนินการ
            </div>
          ) : (
            <div className="bg-white shadow overflow-hidden sm:rounded-lg divide-y divide-gray-100">
              {pendingBookings.map((b) => (
                <div key={b.id} className="px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {b.vehicle.name} <span className="text-gray-400 font-normal">({b.vehicle.licensePlate})</span>
                    </p>
                    <p className="text-xs text-gray-600">
                      ขอโดย{" "}
                      <Link href={`/users/${b.userId}`} className="hover:text-orange-600">
                        {b.user.nickname || b.user.fullName || b.user.username}
                      </Link>
                      {b.purpose ? ` — ${b.purpose}` : ""}
                    </p>
                    <p className="text-[10px] text-gray-400 flex items-center mt-1">
                      <Clock className="w-3 h-3 mr-1" />
                      {formatThaiDateTime(b.startAt)} — {formatThaiDateTime(b.endAt)}
                    </p>
                  </div>
                  <BookingApprovalButtons bookingId={b.id} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">รถทั้งหมด</h2>
        {vehicles.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-200 rounded-lg py-10 text-center text-sm text-gray-400">
            ยังไม่มีรถในระบบ
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {vehicles.map((v) => (
              <VehicleBookingCard key={v.id} vehicle={v} isLoggedIn={isLoggedIn} />
            ))}
          </div>
        )}
      </div>

      {isLoggedIn && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center">
            <CalendarClock className="w-4 h-4 mr-1.5 text-orange-600" />
            คำขอจองของฉัน
          </h2>
          <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">รถ</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">ช่วงเวลา</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">สถานะ</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider"></th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {myBookings.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-10 text-center text-sm text-gray-500 italic">
                        คุณยังไม่มีคำขอจองรถ
                      </td>
                    </tr>
                  ) : (
                    myBookings.map((b) => (
                      <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{b.vehicle.name}</div>
                          <div className="text-xs text-gray-500">{b.vehicle.licensePlate}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatThaiDateTime(b.startAt)} — {formatThaiDateTime(b.endAt)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${statusBadge[b.status] || "bg-gray-100 text-gray-500"}`}>
                            {statusLabel[b.status] || b.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          {(b.status === "PENDING" || b.status === "APPROVED") && (
                            <CancelBookingButton bookingId={b.id} />
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
      )}
    </div>
  );
}
