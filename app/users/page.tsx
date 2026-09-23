import { auth } from "@/auth";
import { getUsers } from "@/app/actions/auth";
import { getUserStatuses } from "@/app/actions/checkin";
import { getWageGrades } from "@/app/actions/wages";
import RoleSelect from "@/components/RoleSelect";
import InternGradeSelect from "@/components/InternGradeSelect";
import Pagination from "@/components/Pagination";
import { User, Shield, Activity, Calendar, MapPin } from "lucide-react";
import Link from "next/link";
import { formatThaiDate, formatThaiDateTime } from "@/lib/datetime";

export const dynamic = "force-dynamic";

interface UserRow {
  id: string;
  username: string;
  fullName: string | null;
  role: string;
  internGrade: string | null;
  createdAt: string;
  _count: { logs: number };
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  const currentPage = Number(page) || 1;

  const [session, result, statusResult, gradesResult] = await Promise.all([
    auth(),
    getUsers({ page: currentPage, limit: 20 }),
    getUserStatuses(),
    getWageGrades(),
  ]);
  const isAdmin = session?.user?.role === "ADMIN";
  const gradeOptions = gradesResult.success && gradesResult.data ? gradesResult.data.map((g) => g.code) : [];

  if (!result.success || !result.data) {
    return (
      <div className="p-8 text-center bg-red-50 text-red-700 rounded-lg">
        {result.error || "Access Denied"}
      </div>
    );
  }

  const users: UserRow[] = result.data;
  const statuses: Record<string, { online: boolean; location: string; since: string }> =
    statusResult.success && statusResult.data ? statusResult.data : {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <Shield className="mr-2 h-6 w-6 text-orange-600" />
          User Management
        </h1>
        <p className="text-gray-500">Manage user roles and monitor their activity logs</p>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Grade</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Joined</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Activity</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((user) => {
                const status = statuses[user.id];
                return (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link href={`/users/${user.id}`} className="flex items-center group">
                        <div className="h-10 w-10 flex-shrink-0 bg-orange-100 rounded-full flex items-center justify-center group-hover:bg-orange-200 transition-colors">
                          <User className="h-6 w-6 text-orange-600" />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900 group-hover:text-orange-600 transition-colors">{user.username}</div>
                          <div className="text-xs text-gray-500">{user.fullName || "No full name"}</div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {!status ? (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-100 text-gray-500">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-400 mr-1.5" />
                          No check-in yet
                        </span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex items-center w-fit px-2 py-0.5 text-xs font-semibold rounded-full ${
                            status.online ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${status.online ? "bg-green-500" : "bg-gray-400"}`} />
                            {status.online ? "Online" : "Offline"}
                          </span>
                          {status.online && (
                            <span className={`inline-flex items-center w-fit px-2 py-0.5 text-[10px] font-semibold rounded-full ${
                              status.location === "OUTSIDE" ? "bg-yellow-100 text-yellow-800" : "bg-blue-100 text-blue-700"
                            }`}>
                              <MapPin className="w-2.5 h-2.5 mr-1" />
                              {status.location === "OUTSIDE" ? "Outside Office" : "Onsite"}
                            </span>
                          )}
                          <span className="text-[10px] text-gray-400">
                            since {formatThaiDateTime(status.since)}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="w-32">
                        <RoleSelect userId={user.id} initialRole={user.role} readOnly={!isAdmin} />
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="w-28">
                        <InternGradeSelect
                          userId={user.id}
                          initialGrade={user.internGrade}
                          gradeOptions={gradeOptions}
                          readOnly={!isAdmin}
                        />
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex items-center">
                        <Calendar className="mr-1.5 h-4 w-4 text-gray-400" />
                        {formatThaiDate(user.createdAt)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm text-gray-900">
                        <Activity className="mr-1.5 h-4 w-4 text-green-500" />
                        <span className="font-semibold">{user._count.logs}</span>
                        <span className="ml-1 text-gray-500 text-xs">actions</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination totalPages={result.totalPages || 1} currentPage={currentPage} />
    </div>
  );
}
