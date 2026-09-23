import Link from "next/link";
import { LogOut, User, ScanFace } from "lucide-react";
import { auth, signOut } from "@/auth";
import { getPendingBookingsCount } from "@/app/actions/carbooking";
import { getPendingLeaveRequestsCount } from "@/app/actions/leave";
import MobileNavMenu from "./MobileNavMenu";
import NavDropdown, { type NavDropdownItem } from "./NavDropdown";
import { isOtManagerRole } from "@/lib/roles";

const linkClass =
  "inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-300 hover:text-orange-400 hover:border-orange-500 transition-colors";

export default async function Navbar() {
  const session = await auth();
  const role = session?.user?.role;
  const isApprover = role === "ADMIN" || role === "OPERATOR";
  const [pendingBookingsResult, pendingLeaveResult] = isApprover
    ? await Promise.all([getPendingBookingsCount(), getPendingLeaveRequestsCount()])
    : [null, null];
  const pendingBookingsCount = pendingBookingsResult?.success ? pendingBookingsResult.data : 0;
  const pendingLeaveCount = pendingLeaveResult?.success ? pendingLeaveResult.data : 0;

  const workItems: NavDropdownItem[] = [
    { href: "/leave", label: "การลา", icon: "CalendarHeart", badge: pendingLeaveCount },
    { href: "/work-schedule", label: "ตารางงาน (Work Schedule)", icon: "CalendarRange" },
    ...(isOtManagerRole(role)
      ? [
          { href: "/ot", label: "OT", icon: "Timer" } as NavDropdownItem,
          { href: "/ot/summary", label: "สรุป OT (OT Summary)", icon: "BarChart3" } as NavDropdownItem,
        ]
      : []),
  ];

  const resourceItems: NavDropdownItem[] = [
    { href: "/dashboard", label: "Dashboard (ภาพรวม)", icon: "LayoutDashboard" },
    { href: "/catalog", label: "Catalog (รายการอุปกรณ์)", icon: "ShoppingBag" },
    { href: "/my-loans", label: "My Loans (ของที่ยืม)", icon: "PackageCheck" },
    { href: "/carbook", label: "Car Booking (จองรถ)", icon: "Car", badge: pendingBookingsCount },
    ...(role === "ADMIN" || role === "OPERATOR"
      ? [{ href: "/inventory", label: "Inventory (คลังอุปกรณ์)", icon: "ListFilter" } as NavDropdownItem]
      : []),
  ];

  const projectItems: NavDropdownItem[] = [
    { href: "/projects", label: "Projects (โปรเจกต์)", icon: "Briefcase" },
    { href: "/circuit", label: "Circuit (วงจรไฟฟ้า)", icon: "Cpu" },
    { href: "/diagrams", label: "Wiring (การเดินสาย)", icon: "Share2" },
  ];

  const adminItems: NavDropdownItem[] = [
    { href: "/users", label: "Users (ผู้ใช้งาน)", icon: "User" },
    { href: "/attendance", label: "Attendance Report (รายงานเข้างาน)", icon: "ClipboardList" },
    { href: "/wages", label: "ค่าแรงเด็กฝึกงาน (Wages)", icon: "Wallet" },
  ];

  return (
    <nav className="bg-gray-950 border-b border-gray-800 sticky top-0 z-40 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href="/" className="flex-shrink-0 flex items-center">
              <span className="text-xl font-bold text-orange-500">GMR</span>
              <span className="text-xl font-bold text-white">AssetManager</span>
            </Link>
            <MobileNavMenu
              isLoggedIn={!!session}
              role={role}
              pendingBookingsCount={pendingBookingsCount}
              pendingLeaveCount={pendingLeaveCount}
            />
            <div className="hidden sm:-my-px sm:ml-6 sm:flex sm:items-center sm:space-x-6">
              <Link href="/checkin" className={linkClass}>
                <ScanFace className="w-4 h-4 mr-1" />
                Check-In (สแกนหน้าเข้างาน)
              </Link>
              {session && (
                <>
                  <NavDropdown label="งาน" icon="Briefcase" items={workItems} badge={pendingLeaveCount} />
                  <NavDropdown label="ทรัพยากร" icon="Boxes" items={resourceItems} badge={pendingBookingsCount} />
                  <NavDropdown label="โปรเจกต์" icon="Cpu" items={projectItems} />
                  {role === "ADMIN" && (
                    <NavDropdown label="ผู้ดูแลระบบ" icon="ShieldCheck" items={adminItems} />
                  )}
                </>
              )}
            </div>
          </div>
          <div className="flex items-center flex-shrink-0">
            {session ? (
              <div className="flex items-center gap-1 sm:gap-4">
                <Link
                  href={`/users/${session.user?.id}`}
                  className="flex items-center px-2 sm:px-0 py-2 text-sm font-medium text-gray-200 hover:text-orange-400 transition-colors"
                >
                  <User className="w-4 h-4 sm:mr-1 text-orange-500" />
                  <span className="hidden sm:inline">
                    {session.user?.name || session.user?.username || "User"}
                  </span>
                </Link>
                <form
                  action={async () => {
                    "use server";
                    await signOut();
                  }}
                >
                  <button
                    type="submit"
                    className="flex items-center px-2 sm:px-3 py-2 border border-transparent text-sm font-medium rounded-md text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
                    aria-label="Logout"
                  >
                    <LogOut className="w-4 h-4 sm:mr-2" />
                    <span className="hidden sm:inline">Logout (ออกจากระบบ)</span>
                  </button>
                </form>
              </div>
            ) : (
              <div className="flex items-center gap-2 sm:gap-4">
                <Link
                  href="/login"
                  className="text-sm font-medium text-gray-300 hover:text-orange-400 transition-colors"
                >
                  Sign In (เข้าสู่ระบบ)
                </Link>
                <Link
                  href="/register"
                  className="inline-flex items-center px-3 sm:px-4 py-2 border border-transparent text-sm font-medium rounded-md text-gray-950 bg-orange-500 hover:bg-orange-400 shadow-sm transition-colors"
                >
                  Register (สมัครสมาชิก)
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
