import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { User, Activity, Clock, FileText } from "lucide-react";
import Link from "next/link";

export default async function UserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const currentUser = session?.user as any;

  if (currentUser?.role !== "ADMIN") {
    return <div className="p-8 text-center text-red-600">Access Denied</div>;
  }

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      logs: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });

  if (!user) return <div className="p-8 text-center">User not found</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <User className="mr-2 h-6 w-6 text-indigo-600" />
          User Profile: {user.username}
        </h1>
        <Link href="/users" className="text-sm text-indigo-600 hover:text-indigo-500 font-medium">
          &larr; Back to Users
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 shadow rounded-lg border border-gray-100">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Details</h2>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-400">Full Name</p>
              <p className="text-sm font-medium text-gray-900">{user.fullName || "-"}</p>
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
                "bg-gray-100 text-gray-700"
              }`}>
                {user.role}
              </span>
            </div>
          </div>
        </div>

        <div className="md:col-span-2 bg-white shadow rounded-lg border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center">
            <Activity className="h-5 w-5 text-indigo-600 mr-2" />
            <h2 className="text-sm font-semibold text-gray-900">Activity Logs (Recent 50)</h2>
          </div>
          <div className="overflow-y-auto max-h-[500px]">
            <ul className="divide-y divide-gray-100">
              {user.logs.length === 0 ? (
                <li className="px-6 py-10 text-center text-sm text-gray-500 italic">No activity logs found.</li>
              ) : (
                user.logs.map((log) => (
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
                          {new Date(log.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
