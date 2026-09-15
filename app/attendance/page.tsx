import { auth } from "@/auth";
import { getAttendanceTableRows } from "@/app/actions/checkin";
import Pagination from "@/components/Pagination";
import AttendanceTable from "@/components/AttendanceTable";
import { ClipboardList, Download } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return <div className="p-8 text-center text-red-600">Access Denied</div>;
  }

  const { page } = await searchParams;
  const currentPage = Number(page) || 1;

  const result = await getAttendanceTableRows({ page: currentPage, limit: 50 });
  const rows = result.success && result.data ? result.data : [];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <ClipboardList className="mr-2 h-6 w-6 text-orange-600" />
            Attendance
          </h1>
          <p className="text-gray-500">Face check-in / check-out history for all employees</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/api/attendance/export-summary"
            className="inline-flex items-center px-4 py-2 rounded-md text-white bg-orange-600 hover:bg-orange-700 font-medium text-sm shadow-sm"
          >
            <Download className="w-4 h-4 mr-2" />
            Export Daily Summary CSV
          </a>
          <a
            href="/api/attendance/export"
            className="inline-flex items-center px-4 py-2 rounded-md text-gray-600 bg-white border border-gray-300 hover:bg-gray-50 font-medium text-sm"
          >
            <Download className="w-4 h-4 mr-2" />
            Export Raw Log CSV
          </a>
        </div>
      </div>

      <AttendanceTable rows={rows} />

      {result.success && <Pagination totalPages={result.totalPages} currentPage={currentPage} paramName="page" />}
    </div>
  );
}
