import Link from "next/link";
import { LogOut, User, ScanFace } from "lucide-react";
import { auth, signOut } from "@/auth";
import NavBadges from "./NavBadges";

const linkClass =
  "inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-300 hover:text-orange-400 hover:border-orange-500 transition-colors";

// The badge counts (pending bookings/leave requests) used to be fetched
// here and awaited before anything could render — since Navbar sits in the
// root layout, that meant every single page on the site paid for those two
// DB queries before its first byte. NavBadges fetches them client-side
// after the nav has already painted, so this component now only needs the
// session (fast — JWT decode, no DB round trip).
export default async function Navbar() {
  const session = await auth();
  const role = session?.user?.role;

  return (
    <nav className="bg-gray-950 border-b border-gray-800 sticky top-0 z-40 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href="/" className="flex-shrink-0 flex items-center">
              <span className="text-xl font-bold text-orange-500">GMR</span>
              <span className="text-xl font-bold text-white">AssetManager</span>
            </Link>
            <NavBadges isLoggedIn={!!session} role={role}>
              <Link href="/checkin" className={linkClass}>
                <ScanFace className="w-4 h-4 mr-1" />
                Check-In (สแกนหน้าเข้างาน)
              </Link>
            </NavBadges>
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
