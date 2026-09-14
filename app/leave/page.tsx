import { auth } from "@/auth";
import { getMyLeaveRequests, getPendingLeaveRequests } from "@/app/actions/leave";
import NewLeaveRequestForm from "@/components/NewLeaveRequestForm";
import LeaveApprovalButtons from "@/components/LeaveApprovalButtons";
import CancelLeaveButton from "@/components/CancelLeaveButton";
import { CalendarHeart, ShieldAlert, Clock } from "lucide-react";

export const dynamic = "force-dynamic";

interface MyLeaveRequest {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: string;
}

interface PendingLeaveRequest {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  createdAt: string;
  user: { username: string; fullName: string | null };
}

const leaveTypeLabel: Record<string, string> = {
  SICK: "ลาป่วย",
  PERSONAL: "ลากิจ",
  VACATION: "ลาพักร้อน",
};

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

function formatDateRange(startDate: string, endDate: string) {
  const start = new Date(startDate).toLocaleDateString("th-TH");
  const end = new Date(endDate).toLocaleDateString("th-TH");
  return start === end ? start : `${start} — ${end}`;
}

export default async function LeavePage() {
  const session = await auth();
  const isLoggedIn = !!session?.user;
  const isApprover = session?.user?.role === "ADMIN" || session?.user?.role === "OPERATOR";

  const [myLeaveResult, pendingResult] = await Promise.all([
    isLoggedIn ? getMyLeaveRequests() : Promise.resolve({ success: false as const, data: undefined }),
    isApprover ? getPendingLeaveRequests() : Promise.resolve({ success: false as const, data: undefined }),
  ]);

  const myLeaveRequests: MyLeaveRequest[] =
    myLeaveResult.success && myLeaveResult.data ? myLeaveResult.data : [];
  const pendingLeaveRequests: PendingLeaveRequest[] =
    pendingResult.success && pendingResult.data ? pendingResult.data : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <CalendarHeart className="mr-2 h-6 w-6 text-orange-600" />
          การลา
        </h1>
        <p className="text-gray-500">ยื่นใบลาป่วย ลากิจ หรือลาพักร้อน — ต้องได้รับอนุมัติจาก Operator หรือ Admin ก่อน</p>
      </div>

      {isApprover && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center">
            <ShieldAlert className="w-4 h-4 mr-1.5 text-orange-600" />
            รออนุมัติ ({pendingLeaveRequests.length})
          </h2>
          {pendingLeaveRequests.length === 0 ? (
            <div className="bg-white border border-dashed border-gray-200 rounded-lg py-8 text-center text-sm text-gray-400">
              ไม่มีใบลารอดำเนินการ
            </div>
          ) : (
            <div className="bg-white shadow overflow-hidden sm:rounded-lg divide-y divide-gray-100">
              {pendingLeaveRequests.map((l) => (
                <div key={l.id} className="px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {leaveTypeLabel[l.type] || l.type}{" "}
                      <span className="text-gray-400 font-normal">
                        ({l.user.fullName || l.user.username})
                      </span>
                    </p>
                    {l.reason && <p className="text-xs text-gray-600">{l.reason}</p>}
                    <p className="text-[10px] text-gray-400 flex items-center mt-1">
                      <Clock className="w-3 h-3 mr-1" />
                      {formatDateRange(l.startDate, l.endDate)}
                    </p>
                  </div>
                  <LeaveApprovalButtons leaveRequestId={l.id} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isLoggedIn ? (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">ยื่นใบลาใหม่</h2>
          <NewLeaveRequestForm />
        </div>
      ) : (
        <div className="bg-white border border-dashed border-gray-200 rounded-lg py-10 text-center text-sm text-gray-400">
          กรุณาเข้าสู่ระบบเพื่อยื่นใบลา
        </div>
      )}

      {isLoggedIn && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">ใบลาของฉัน</h2>
          <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">ประเภท</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">ช่วงวันที่</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">สถานะ</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider"></th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {myLeaveRequests.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-10 text-center text-sm text-gray-500 italic">
                        คุณยังไม่มีใบลา
                      </td>
                    </tr>
                  ) : (
                    myLeaveRequests.map((l) => (
                      <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{leaveTypeLabel[l.type] || l.type}</div>
                          {l.reason && <div className="text-xs text-gray-500">{l.reason}</div>}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDateRange(l.startDate, l.endDate)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${statusBadge[l.status] || "bg-gray-100 text-gray-500"}`}>
                            {statusLabel[l.status] || l.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          {(l.status === "PENDING" || l.status === "APPROVED") && (
                            <CancelLeaveButton leaveRequestId={l.id} />
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
