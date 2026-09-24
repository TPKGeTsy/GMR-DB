import { auth } from "@/auth";
import { getOutsideTripEmployeeOptions, getRecentOutsideTrips } from "@/app/actions/outsideTrip";
import StartOutsideTripForm from "@/components/StartOutsideTripForm";
import WageReportFilters from "@/components/WageReportFilters";
import { bangkokDateKey, formatThaiDateLong, formatThaiTime } from "@/lib/datetime";
import { MapPin, Users, Clock } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function OutsideTripPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    return <div className="p-8 text-center text-red-600">กรุณาเข้าสู่ระบบก่อน</div>;
  }
  const isAdmin = session.user.role === "ADMIN";

  const { from, to } = await searchParams;
  const today = bangkokDateKey(new Date());
  const defaultFrom = `${today.slice(0, 7)}-01`;
  const rangeFrom = from || defaultFrom;
  const rangeTo = to || today;

  const [optionsResult, tripsResult] = await Promise.all([
    getOutsideTripEmployeeOptions(),
    isAdmin ? getRecentOutsideTrips({ from: rangeFrom, to: rangeTo }) : Promise.resolve({ success: false as const, data: undefined }),
  ]);
  const employeeOptions = optionsResult.success && optionsResult.data ? optionsResult.data : [];
  const trips = tripsResult.success && tripsResult.data ? tripsResult.data : [];

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <MapPin className="mr-2 h-6 w-6 text-orange-600" />
          ออกหน้างาน (Outside Work Trip)
        </h1>
        <p className="text-gray-500">
          บันทึกทีมที่ออกไปทำงานนอกสถานที่ — ใครที่เช็คอินอยู่ในออฟฟิศจะถูกเช็คเอาท์ให้อัตโนมัติแล้วเปลี่ยนเป็นทำงานนอกสถานที่
        </p>
      </div>

      <StartOutsideTripForm employeeOptions={employeeOptions} currentUserId={session.user.id} />

      {isAdmin && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">ประวัติทริปออกหน้างาน</h2>
          <WageReportFilters defaultFrom={defaultFrom} defaultTo={today} />
          <div className="bg-white shadow rounded-lg border border-gray-100 overflow-hidden">
            {trips.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-gray-400 italic">ไม่มีทริปออกหน้างานในช่วงนี้</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {trips.map((trip) => (
                  <li key={trip.id}>
                    <Link href={`/outside-trip/${trip.id}`} className="block px-6 py-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center justify-between flex-wrap gap-2 mb-1.5">
                        <span className="text-sm font-semibold text-gray-900 flex items-center">
                          <MapPin className="w-4 h-4 mr-1.5 text-orange-600" />
                          {trip.location}
                        </span>
                        <span className="text-xs text-gray-400 flex items-center">
                          {formatThaiDateLong(trip.createdAt)}
                          <span className="mx-2 text-gray-300">•</span>
                          <Users className="w-3.5 h-3.5 mr-1" />
                          {trip.members.length} คน
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">
                        หัวหน้าทีม/ผู้บันทึก: <span className="font-medium text-gray-700">{trip.createdByName}</span>
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {trip.members.map((m) => (
                          <span
                            key={m.userId}
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-50 border border-gray-100 text-xs text-gray-700"
                          >
                            <span className="font-medium text-gray-900">{m.name}</span>
                            <Clock className="w-3 h-3 text-gray-400" />
                            {formatThaiTime(m.outAt)}
                            {" → "}
                            {m.backAt ? formatThaiTime(m.backAt) : <span className="text-green-600 font-semibold">ยังไม่กลับ</span>}
                          </span>
                        ))}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
