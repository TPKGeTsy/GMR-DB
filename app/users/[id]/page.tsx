import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { User, Activity, Clock, FileText, MapPin, CalendarClock } from "lucide-react";
import Link from "next/link";
import RegisterFacePanel from "@/components/RegisterFacePanel";
import ChangePasswordPanel from "@/components/ChangePasswordPanel";
import LineAccountPanel from "@/components/LineAccountPanel";
import NicknamePanel from "@/components/NicknamePanel";
import ActivityLogFilters from "@/components/ActivityLogFilters";
import ProfileSummaryFilters from "@/components/ProfileSummaryFilters";
import Pagination from "@/components/Pagination";
import { buildDailySummary, formatHoursTenths } from "@/lib/attendance";
import { countMealDays } from "@/lib/wages";
import { gradeBadgeClass } from "@/lib/gradeColor";
import { formatThaiDateLong, formatThaiDateTime, formatThaiTime, bangkokDateKey } from "@/lib/datetime";
import { getUserActivityLogs, getUserActivityActions } from "@/app/actions/auth";
import { canManageUsers } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function UserProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    logFrom?: string; logTo?: string; logAction?: string; logPage?: string;
    sumFrom?: string; sumTo?: string;
  }>;
}) {
  const { id } = await params;
  const { logFrom, logTo, logAction, logPage, sumFrom, sumTo } = await searchParams;
  const session = await auth();
  const currentUser = session?.user;

  const isOwnProfile = currentUser?.id === id;
  if (!canManageUsers(currentUser?.role) && !isOwnProfile) {
    return <div className="p-8 text-center text-red-600">Access Denied</div>;
  }
  // Operators get full /users access except seeing OTHER employees' check-in/
  // attendance history — they can still see their own.
  const canSeeAttendance = currentUser?.role === "ADMIN" || isOwnProfile;

  const [user, logsResult, availableActions] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      include: {
        checkIns: canSeeAttendance
          ? { orderBy: { createdAt: "desc" }, take: 200 }
          : { orderBy: { createdAt: "desc" }, take: 1 }, // just enough for the online/offline badge
      },
    }),
    getUserActivityLogs(id, { from: logFrom, to: logTo, action: logAction, page: Number(logPage) || 1, limit: 20 }),
    getUserActivityActions(id),
  ]);

  if (!user) return <div className="p-8 text-center">User not found</div>;

  const logs = logsResult.success && logsResult.data ? logsResult.data : [];
  const logTotalPages = logsResult.success ? logsResult.totalPages : 1;

  const dailyRows = canSeeAttendance ? buildDailySummary(user.checkIns) : [];
  const latestCheckIn = user.checkIns[0];
  const isOnline = latestCheckIn?.type === "IN";
  // Accumulated "meal" count — one per calendar day this person went out to
  // work outside the office, for whoever settles those meals later.
  const mealDays = canSeeAttendance ? countMealDays(user.checkIns) : 0;

  // Worked/OT hours over an admin-picked date range (defaults to this
  // calendar month), for a quick workload summary at a glance — reuses the
  // same per-day totals the Daily Timesheet already computes.
  const today = bangkokDateKey(new Date());
  const defaultSumFrom = `${today.slice(0, 7)}-01`; // start of this month
  const rangeFrom = sumFrom || defaultSumFrom;
  const rangeTo = sumTo || today;
  const summaryRows = dailyRows.filter((row) => row.dateKey >= rangeFrom && row.dateKey <= rangeTo);
  const periodSummary = {
    days: summaryRows.length,
    totalHours: summaryRows.reduce((sum, row) => sum + row.totalHours, 0),
    otHours: summaryRows.reduce((sum, row) => sum + row.otHours, 0),
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <User className="mr-2 h-6 w-6 text-orange-600" />
          User Profile: {user.username}
        </h1>
        {canManageUsers(currentUser?.role) && (
          <Link href="/users" className="text-sm text-orange-600 hover:text-orange-500 font-medium">
            &larr; Back to Users
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-6">
          <div className="bg-white p-6 shadow rounded-lg border border-gray-100">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Details</h2>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-400">Full Name</p>
                <p className="text-sm font-medium text-gray-900">{user.fullName || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">Nickname</p>
                <NicknamePanel userId={user.id} initialNickname={user.nickname} />
              </div>
              <div>
                <p className="text-xs text-gray-400">Username</p>
                <p className="text-sm font-medium text-gray-900">{user.username}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Role</p>
                <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                  user.role === "ADMIN" ? "bg-purple-100 text-purple-700" :
                  user.role === "OPERATOR" ? "bg-blue-100 text-blue-700" :
                  user.role === "SENIOR" ? "bg-teal-100 text-teal-700" :
                  "bg-gray-100 text-gray-700"
                }`}>
                  {user.role}
                </span>
              </div>
              {user.internGrade && (
                <div>
                  <p className="text-xs text-gray-400">เกรดเด็กฝึกงาน</p>
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${gradeBadgeClass(user.internGrade)}`}>
                    {user.internGrade}
                  </span>
                </div>
              )}
              <div>
                <p className="text-xs text-gray-400">Check-in status</p>
                {!latestCheckIn ? (
                  <span className="inline-flex items-center w-fit px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-100 text-gray-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 mr-1.5" />
                    No check-in yet
                  </span>
                ) : (
                  <div className="flex flex-col gap-1">
                    <span className={`inline-flex items-center w-fit px-2 py-0.5 text-xs font-semibold rounded-full ${
                      isOnline ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isOnline ? "bg-green-500" : "bg-gray-400"}`} />
                      {isOnline ? "Online" : "Offline"}
                    </span>
                    {isOnline && (
                      <span className={`inline-flex items-center w-fit px-2 py-0.5 text-[10px] font-semibold rounded-full ${
                        latestCheckIn.location === "OUTSIDE" ? "bg-yellow-100 text-yellow-800" : "bg-blue-100 text-blue-700"
                      }`}>
                        <MapPin className="w-2.5 h-2.5 mr-1" />
                        {latestCheckIn.location === "OUTSIDE" ? "Outside Office" : "Onsite"}
                      </span>
                    )}
                    <span className="text-[10px] text-gray-400">
                      since {formatThaiDateTime(latestCheckIn.createdAt)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <RegisterFacePanel
            userId={user.id}
            initialRegistered={user.faceDescriptor.length > 0}
            initialRegisteredAt={user.faceRegisteredAt ? user.faceRegisteredAt.toISOString() : null}
          />

          <ChangePasswordPanel userId={user.id} isSelf={isOwnProfile} />

          {canManageUsers(currentUser?.role) && (
            <LineAccountPanel userId={user.id} username={user.username} isLinked={!!user.lineUserId} />
          )}
        </div>

        <div className="md:col-span-2 space-y-6">
          {canSeeAttendance && (
            <div className="bg-white shadow rounded-lg border border-gray-100 p-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
                สรุปชั่วโมงทำงาน
              </h2>
              <ProfileSummaryFilters defaultFrom={defaultSumFrom} defaultTo={today} />
              <div className="grid grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-gray-900">{periodSummary.days}</p>
                  <p className="text-xs text-gray-400 mt-1">วันทำงาน</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{formatHoursTenths(periodSummary.totalHours)}</p>
                  <p className="text-xs text-gray-400 mt-1">ชั่วโมงรวม</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-orange-600">{formatHoursTenths(periodSummary.otHours)}</p>
                  <p className="text-xs text-gray-400 mt-1">ชั่วโมง OT</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-blue-600">{mealDays}</p>
                  <p className="text-xs text-gray-400 mt-1">มื้อสะสม (ตลอดกาล)</p>
                </div>
              </div>
            </div>
          )}

          {canSeeAttendance && (
          <div className="bg-white shadow rounded-lg border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center">
              <CalendarClock className="h-5 w-5 text-orange-600 mr-2" />
              <h2 className="text-sm font-semibold text-gray-900">Daily Timesheet</h2>
            </div>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left text-[10px] font-medium text-gray-700 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-2 text-left text-[10px] font-medium text-gray-700 uppercase tracking-wider">Start</th>
                    <th className="px-4 py-2 text-left text-[10px] font-medium text-gray-700 uppercase tracking-wider">End</th>
                    <th className="px-4 py-2 text-left text-[10px] font-medium text-gray-700 uppercase tracking-wider">Hours</th>
                    <th className="px-4 py-2 text-left text-[10px] font-medium text-gray-700 uppercase tracking-wider">OT</th>
                    <th className="px-4 py-2 text-left text-[10px] font-medium text-gray-700 uppercase tracking-wider">Location</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {dailyRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-xs text-gray-400 italic">
                        No check-in history yet
                      </td>
                    </tr>
                  ) : (
                    dailyRows.map((row) => (
                      <tr key={row.dateKey} className="hover:bg-gray-50">
                        <td className="px-4 py-2 whitespace-nowrap text-xs font-medium text-gray-900">
                          {formatThaiDateLong(row.dateKey)}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-700">
                          {row.startTime ? formatThaiTime(row.startTime) : "-"}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-700">
                          {row.stillWorking ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-semibold">
                              Still working
                            </span>
                          ) : row.endTime ? (
                            formatThaiTime(row.endTime)
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-700">
                          {row.totalHours > 0 ? `${formatHoursTenths(row.totalHours)} ชม.` : "-"}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-xs">
                          {row.otHours > 0 ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[10px] font-semibold">
                              +{formatHoursTenths(row.otHours)} ชม.
                            </span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                            row.location === "OUTSIDE" ? "bg-yellow-100 text-yellow-800" : "bg-blue-100 text-blue-700"
                          }`}>
                            <MapPin className="w-2.5 h-2.5 mr-1" />
                            {row.location === "OUTSIDE" ? "Outside" : "Onsite"}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          )}

          <div className="bg-white shadow rounded-lg border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center">
              <Activity className="h-5 w-5 text-orange-600 mr-2" />
              <h2 className="text-sm font-semibold text-gray-900">Activity Logs</h2>
            </div>
            <ActivityLogFilters actions={availableActions} />
            <div className="overflow-y-auto max-h-[400px]">
              <ul className="divide-y divide-gray-100">
                {logs.length === 0 ? (
                  <li className="px-6 py-10 text-center text-sm text-gray-500 italic">No activity logs found.</li>
                ) : (
                  logs.map((log) => (
                    <li key={log.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-gray-900 flex items-center">
                            <FileText className="h-3 w-3 mr-1.5 text-gray-400" />
                            {log.action}
                          </p>
                          <p className="text-xs text-gray-600">{log.details}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-gray-400 flex items-center justify-end">
                            <Clock className="h-3 w-3 mr-1" />
                            {formatThaiDateTime(log.createdAt)}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>
            {logTotalPages > 1 && (
              <div className="border-t border-gray-100">
                <Pagination totalPages={logTotalPages} currentPage={Number(logPage) || 1} paramName="logPage" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
