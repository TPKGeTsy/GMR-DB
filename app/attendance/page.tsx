import { auth } from "@/auth";
import { getAttendanceLogs, getDailyAttendanceSummary } from "@/app/actions/checkin";
import { ClipboardList, Download, LogIn, LogOut, MapPin, CalendarClock } from "lucide-react";

export const dynamic = "force-dynamic";

interface AttendanceLog {
  id: string;
  type: string;
  location: string;
  note: string | null;
  confidence: number;
  createdAt: string;
  user: { username: string; fullName: string | null };
}

export default async function AttendancePage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return <div className="p-8 text-center text-red-600">Access Denied</div>;
  }

  const [result, summaryResult] = await Promise.all([
    getAttendanceLogs(),
    getDailyAttendanceSummary(),
  ]);
  const logs: AttendanceLog[] = result.success && result.data ? result.data : [];
  const dailyRows = summaryResult.success && summaryResult.data ? summaryResult.data : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <ClipboardList className="mr-2 h-6 w-6 text-orange-600" />
          Attendance
        </h1>
        <p className="text-gray-500">Face check-in / check-out history for all employees</p>
      </div>

      {/* Daily Summary with hours & OT */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center">
            <CalendarClock className="w-4 h-4 mr-1.5 text-orange-600" />
            Daily Summary (Hours &amp; OT)
          </h2>
          <a
            href="/api/attendance/export-summary"
            className="inline-flex items-center px-4 py-2 rounded-md text-white bg-orange-600 hover:bg-orange-700 font-medium text-sm shadow-sm"
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </a>
        </div>

        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Employee</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Start</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">End</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Hours</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">OT</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Location</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {dailyRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-sm text-gray-500 italic">
                      No attendance records yet.
                    </td>
                  </tr>
                ) : (
                  dailyRows.map((row) => (
                    <tr key={`${row.userId}-${row.dateKey}`} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {new Date(row.dateKey).toLocaleDateString(undefined, {
                          weekday: "short",
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{row.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {row.startTime ? new Date(row.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {row.stillWorking ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-semibold">
                            Still working
                          </span>
                        ) : row.endTime ? (
                          new Date(row.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {row.totalHours > 0 ? `${row.totalHours.toFixed(1)} ชม.` : "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {row.otHours > 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-xs font-semibold">
                            +{row.otHours.toFixed(1)} ชม.
                          </span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full ${
                          row.location === "OUTSIDE" ? "bg-yellow-100 text-yellow-800" : "bg-blue-100 text-blue-700"
                        }`}>
                          <MapPin className="w-3 h-3 mr-1" />
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
      </div>

      {/* Raw scan log */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Raw Scan Log</h2>
          <a
            href="/api/attendance/export"
            className="inline-flex items-center px-3 py-1.5 rounded-md text-gray-600 bg-white border border-gray-300 hover:bg-gray-50 font-medium text-xs"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export CSV
          </a>
        </div>

        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Employee</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Location</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Note</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Match</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Time</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-500 italic">
                      No attendance records yet.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {log.user.fullName || log.user.username}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full ${
                          log.type === "IN" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"
                        }`}>
                          {log.type === "IN" ? <LogIn className="w-3 h-3 mr-1" /> : <LogOut className="w-3 h-3 mr-1" />}
                          {log.type === "IN" ? "Check In" : "Check Out"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full ${
                          log.location === "OUTSIDE" ? "bg-yellow-100 text-yellow-800" : "bg-blue-100 text-blue-700"
                        }`}>
                          <MapPin className="w-3 h-3 mr-1" />
                          {log.location === "OUTSIDE" ? "Outside Office" : "Office"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate" title={log.note || ""}>
                        {log.note || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {Math.round(log.confidence * 100)}%
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
