import { getOutsideTripDetail } from "@/app/actions/outsideTrip";
import TripReportEditor from "@/components/TripReportEditor";
import { formatThaiDateLong, formatThaiTime } from "@/lib/datetime";
import { MapPin, Users, User, Clock, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OutsideTripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getOutsideTripDetail(id);

  if (!result.success) {
    if (result.error === "ไม่พบทริปนี้") notFound();
    return <div className="p-8 text-center text-red-600">{result.error}</div>;
  }

  const trip = result.data;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link href="/outside-trip" className="inline-flex items-center text-sm text-gray-500 hover:text-orange-600">
        <ArrowLeft className="w-4 h-4 mr-1" />
        กลับไปหน้าออกหน้างาน
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <MapPin className="mr-2 h-6 w-6 text-orange-600" />
          {trip.location}
        </h1>
        <p className="text-gray-500">{formatThaiDateLong(trip.createdAt)}</p>
      </div>

      <div className="bg-white shadow rounded-lg border border-gray-100 divide-y divide-gray-100">
        <div className="px-6 py-4 flex flex-wrap gap-x-8 gap-y-2">
          <div className="flex items-center text-sm text-gray-700">
            <User className="w-4 h-4 mr-1.5 text-orange-500" />
            หัวหน้าทีม/ผู้บันทึก: <span className="font-medium text-gray-900 ml-1">{trip.createdByName}</span>
          </div>
          <div className="flex items-center text-sm text-gray-700">
            <Users className="w-4 h-4 mr-1.5 text-orange-500" />
            ผู้ปฏิบัติงาน {trip.members.length} คน
          </div>
        </div>

        <div className="px-6 py-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">ผู้ปฏิบัติงาน</p>
          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-md overflow-hidden">
            {trip.members.map((m) => (
              <li key={m.userId} className="px-3 py-2 bg-white flex items-center justify-between gap-2">
                <Link href={`/users/${m.userId}`} className="text-sm text-gray-900 hover:text-orange-600 font-medium">
                  {m.name}
                </Link>
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-gray-400" />
                  {formatThaiTime(m.outAt)}
                  {" → "}
                  {m.backAt ? formatThaiTime(m.backAt) : <span className="text-green-600 font-semibold">ยังไม่กลับ</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="px-6 py-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">หมายเหตุ / รายงานเพิ่มเติม</p>
          <TripReportEditor tripId={trip.id} initialReport={trip.report} />
        </div>
      </div>
    </div>
  );
}
