import { getOutsideTripDetail } from "@/app/actions/outsideTrip";
import TripReportEditor from "@/components/TripReportEditor";
import TripDetailsEditor from "@/components/TripDetailsEditor";
import { formatThaiDateLong } from "@/lib/datetime";
import { MapPin, Users, User, ArrowLeft } from "lucide-react";
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

        {/* key resets the editor's local state whenever saved data changes */}
        <TripDetailsEditor
          key={`${trip.location}|${trip.members.map((m) => `${m.outAt}-${m.backAt}`).join(",")}`}
          tripId={trip.id}
          location={trip.location}
          members={trip.members}
        />

        <div className="px-6 py-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">หมายเหตุ / รายงานเพิ่มเติม</p>
          <TripReportEditor tripId={trip.id} initialReport={trip.report} />
        </div>
      </div>
    </div>
  );
}
