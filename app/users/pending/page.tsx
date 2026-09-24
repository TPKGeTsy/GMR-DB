import { getPendingUsers } from "@/app/actions/auth";
import PendingUsersList from "@/components/PendingUsersList";
import { UserPlus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PendingUsersPage() {
  const result = await getPendingUsers();

  if (!result.success) {
    return (
      <div className="p-8 text-center bg-red-50 text-red-700 rounded-lg">
        {result.error || "Access Denied"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <UserPlus className="mr-2 h-6 w-6 text-orange-600" />
          บัญชีรออนุมัติ
        </h1>
        <p className="text-gray-500">อนุมัติหรือปฏิเสธบัญชีที่สมัครเข้ามาใหม่</p>
      </div>

      <PendingUsersList initialUsers={result.data} />
    </div>
  );
}
