import Link from "next/link";
import { LayoutDashboard, ListFilter, LogOut, User, ShoppingBag, Cpu, Share2, ScanFace, ClipboardList, PackageCheck, Car, Briefcase, CalendarRange } from "lucide-react";
import { auth, signOut } from "@/auth";
import { getPendingBookingsCount } from "@/app/actions/carbooking";

const linkClass =
  "inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-300 hover:text-orange-400 hover:border-orange-500 transition-colors";

export default async function Navbar() {
  const session = await auth();
  const role = session?.user?.role;
  const isApprover = role === "ADMIN" || role === "OPERATOR";
  const pendingCountResult = isApprover ? await getPendingBookingsCount() : null;
  const pendingCount = pendingCountResult?.success ? pendingCountResult.data : 0;

  return (
    <nav className="bg-gray-950 border-b border-gray-800 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <Link href="/" className="flex-shrink-0 flex items-center">
              <span className="text-xl font-bold text-orange-500">GMR</span>
              <span className="text-xl font-bold text-white">AssetManager</span>
            </Link>
            <div className="hidden sm:-my-px sm:ml-6 sm:flex sm:space-x-4">
              <Link href="/checkin" className={linkClass}>
                <ScanFace className="w-4 h-4 mr-1" />
                Check-In
              </Link>
            </div>
            {session && (
              <div className="hidden sm:-my-px sm:ml-6 sm:flex sm:space-x-4">
                <Link href="/catalog" className={linkClass}>
                  <ShoppingBag className="w-4 h-4 mr-1" />
                  Catalog
                </Link>
                <Link href="/my-loans" className={linkClass}>
                  <PackageCheck className="w-4 h-4 mr-1" />
                  My Loans
                </Link>
                <Link href="/carbook" className={`${linkClass} relative`}>
                  <Car className="w-4 h-4 mr-1" />
                  Car Booking
                  {isApprover && pendingCount > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
                      {pendingCount}
                    </span>
                  )}
                </Link>
                <Link href="/projects" className={linkClass}>
                  <Briefcase className="w-4 h-4 mr-1" />
                  Projects
                </Link>
                <Link href="/work-schedule" className={linkClass}>
                  <CalendarRange className="w-4 h-4 mr-1" />
                  Work Schedule
                </Link>
                <Link href="/dashboard" className={linkClass}>
                  <LayoutDashboard className="w-4 h-4 mr-1" />
                  Dashboard
                </Link>
                <Link href="/circuit" className={linkClass}>
                  <Cpu className="w-4 h-4 mr-1" />
                  Circuit
                </Link>
                <Link href="/diagrams" className={linkClass}>
                  <Share2 className="w-4 h-4 mr-1" />
                  Wiring
                </Link>
                {(role === "ADMIN" || role === "OPERATOR") && (
                  <Link href="/inventory" className={linkClass}>
                    <ListFilter className="w-4 h-4 mr-1" />
                    Inventory
                  </Link>
                )}
                {role === "ADMIN" && (
                  <>
                    <Link href="/users" className={linkClass}>
                      <User className="w-4 h-4 mr-1" />
                      Users
                    </Link>
                    <Link href="/attendance" className={linkClass}>
                      <ClipboardList className="w-4 h-4 mr-1" />
                      Attendance
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center">
            {session ? (
              <div className="flex items-center space-x-4">
                <Link
                  href={`/users/${session.user?.id}`}
                  className="flex items-center text-sm font-medium text-gray-200 hover:text-orange-400 transition-colors"
                >
                  <User className="w-4 h-4 mr-1 text-orange-500" />
                  {session.user?.name || session.user?.username || "User"}
                </Link>
                <form
                  action={async () => {
                    "use server";
                    await signOut();
                  }}
                >
                  <button
                    type="submit"
                    className="flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </button>
                </form>
              </div>
            ) : (
              <div className="flex items-center space-x-4">
                <Link
                  href="/login"
                  className="text-sm font-medium text-gray-300 hover:text-orange-400 transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/register"
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-gray-950 bg-orange-500 hover:bg-orange-400 shadow-sm transition-colors"
                >
                  Register
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
