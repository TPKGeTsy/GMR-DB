import { auth } from "@/auth";
import { getMySchedule, getAllSchedules } from "@/app/actions/workschedule";
import { getMyProjects } from "@/app/actions/projects";
import { getRecentOutsideTrips } from "@/app/actions/outsideTrip";
import AddScheduleEntryForm from "@/components/AddScheduleEntryForm";
import DeleteScheduleEntryButton from "@/components/DeleteScheduleEntryButton";
import { CalendarRange, Clock, Briefcase, MapPin, Users } from "lucide-react";
import { formatThaiDateTime, formatThaiDateLong, formatThaiTime } from "@/lib/datetime";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface ScheduleEntry {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  note: string | null;
  project: { id: string; name: string } | null;
}

interface AllScheduleEntry extends ScheduleEntry {
  userId: string;
  user: { username: string; fullName: string | null; nickname: string | null };
}

export default async function WorkSchedulePage() {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";

  const [myScheduleResult, myProjectsResult, allSchedulesResult, outsideTripsResult] = await Promise.all([
    getMySchedule(),
    getMyProjects(),
    isAdmin ? getAllSchedules() : Promise.resolve({ success: false as const, data: undefined }),
    isAdmin ? getRecentOutsideTrips({ days: 14 }) : Promise.resolve({ success: false as const, data: undefined }),
  ]);

  const mySchedule: ScheduleEntry[] = myScheduleResult.success && myScheduleResult.data ? myScheduleResult.data : [];
  const myProjects = myProjectsResult.success && myProjectsResult.data ? myProjectsResult.data : [];
  const allSchedules: AllScheduleEntry[] = allSchedulesResult.success && allSchedulesResult.data ? allSchedulesResult.data : [];
  const outsideTrips = outsideTripsResult.success && outsideTripsResult.data ? outsideTripsResult.data : [];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <CalendarRange className="mr-2 h-6 w-6 text-orange-600" />
            Work Schedule
          </h1>
          <p className="text-gray-500">ตารางงานของฉัน — ผูกกับโปรเจกต์ที่เข้าร่วมได้</p>
        </div>
        <AddScheduleEntryForm myProjects={myProjects} />
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">ตารางงานของฉัน</h2>
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <ul className="divide-y divide-gray-100">
            {mySchedule.length === 0 ? (
              <li className="px-6 py-10 text-center text-sm text-gray-500 italic">
                ยังไม่มีตารางงาน — กด &quot;เพิ่มตารางงาน&quot; เพื่อเริ่มบันทึก
              </li>
            ) : (
              mySchedule.map((entry) => (
                <li key={entry.id} className="px-6 py-4 flex items-start justify-between hover:bg-gray-50 transition-colors">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{entry.title}</p>
                    <div className="flex items-center flex-wrap gap-2 mt-1">
                      <span className="text-xs text-gray-500 flex items-center">
                        <Clock className="w-3 h-3 mr-1" />
                        {formatThaiDateTime(entry.startAt)} — {formatThaiDateTime(entry.endAt)}
                      </span>
                      {entry.project && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-700 text-[10px] font-semibold">
                          <Briefcase className="w-2.5 h-2.5 mr-1" />
                          {entry.project.name}
                        </span>
                      )}
                    </div>
                    {entry.note && <p className="text-xs text-gray-500 mt-1">{entry.note}</p>}
                  </div>
                  <DeleteScheduleEntryButton id={entry.id} />
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      {isAdmin && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">ทริปออกหน้างาน (14 วันล่าสุด)</h2>
          <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            {outsideTrips.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-gray-500 italic">ยังไม่มีทริปออกหน้างานในช่วงนี้</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {outsideTrips.map((trip) => (
                  <li key={trip.id} className="px-6 py-4">
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
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
                    <div className="flex flex-wrap gap-2">
                      {trip.members.map((m) => (
                        <span
                          key={m.userId}
                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-50 border border-gray-100 text-xs text-gray-700"
                        >
                          <Link href={`/users/${m.userId}`} className="font-medium text-gray-900 hover:text-orange-600">
                            {m.name}
                          </Link>
                          <Clock className="w-3 h-3 text-gray-400" />
                          {formatThaiTime(m.outAt)}
                          {" → "}
                          {m.backAt ? (
                            formatThaiTime(m.backAt)
                          ) : (
                            <span className="text-green-600 font-semibold">ยังไม่กลับ</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {isAdmin && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">ตารางงานพนักงานทั้งหมด</h2>
          <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">พนักงาน</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">งาน</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">โปรเจกต์</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">ช่วงเวลา</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {allSchedules.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-10 text-center text-sm text-gray-500 italic">
                        ยังไม่มีตารางงานในระบบ
                      </td>
                    </tr>
                  ) : (
                    allSchedules.map((entry) => (
                      <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          <Link href={`/users/${entry.userId}`} className="hover:text-orange-600">
                            {entry.user.nickname || entry.user.fullName || entry.user.username}
                          </Link>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">{entry.title}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {entry.project?.name || "-"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-400">
                          {formatThaiDateTime(entry.startAt)} — {formatThaiDateTime(entry.endAt)}
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
