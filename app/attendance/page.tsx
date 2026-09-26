import { auth } from "@/auth";
import { getAttendanceTableRows, getEmployeeOptions } from "@/app/actions/checkin";
import Pagination from "@/components/Pagination";
import AttendanceTable from "@/components/AttendanceTable";
import AttendanceCalendar from "@/components/AttendanceCalendar";
import AttendanceFilters from "@/components/AttendanceFilters";
import { ClipboardList, Download } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; from?: string; to?: string; type?: string; otOnly?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return <div className="p-8 text-center text-red-600">Access Denied</div>;
  }

  const { page, from, to, type, otOnly } = await searchParams;
  const currentPage = Number(page) || 1;
  const typeFilter = type === "IN" || type === "OUT" ? type : undefined;

  const [result, employeeOptionsResult] = await Promise.all([
    getAttendanceTableRows({ page: currentPage, limit: 50, from, to, type: typeFilter, otOnly: otOnly === "1" }),
    getEmployeeOptions(),
  ]);
  const rows = result.success && result.data ? result.data : [];
  const employeeOptions = employeeOptionsResult.success && employeeOptionsResult.data ? employeeOptionsResult.data : [];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <span className="flex items-center justify-center w-9 h-9 rounded-full bg-orange-50 mr-2.5">
              <ClipboardList className="h-5 w-5 text-orange-600" />
            </span>
            Attendance
          </h1>
          <p className="text-gray-500 ml-[46px]">Face check-in / check-out history for all employees</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/api/attendance/export-summary"
            className="inline-flex items-center px-4 py-2.5 rounded-full text-white bg-orange-600 hover:bg-orange-700 active:bg-orange-800 font-semibold text-sm shadow-sm shadow-orange-200 transition-colors"
          >
            <Download className="w-4 h-4 mr-2" />
            Export Daily Summary CSV
          </a>
          <a
            href="/api/attendance/export"
            className="inline-flex items-center px-4 py-2.5 rounded-full text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 active:bg-gray-100 font-semibold text-sm transition-colors"
          >
            <Download className="w-4 h-4 mr-2" />
            Export Raw Log CSV
          </a>
        </div>
      </div>

      <AttendanceCalendar />

      <AttendanceFilters />

      <AttendanceTable rows={rows} employeeOptions={employeeOptions} />

      {result.success && <Pagination totalPages={result.totalPages} currentPage={currentPage} paramName="page" />}
    </div>
  );
}
