import Link from "next/link";
import { LayoutDashboard, ListFilter, PlusCircle, LogOut, User, ShoppingBag } from "lucide-react";
import { auth, signOut } from "@/auth";

export default async function Navbar() {
  const session = await auth();
  const role = (session?.user as any)?.role;

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <Link href="/" className="flex-shrink-0 flex items-center">
              <span className="text-xl font-bold text-indigo-600">AssetManager</span>
            </Link>
            {session && (
              <div className="hidden sm:-my-px sm:ml-6 sm:flex sm:space-x-8">
                <Link
                  href="/catalog"
                  className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-700 hover:text-gray-900 hover:border-gray-300"
                >
                  <ShoppingBag className="w-4 h-4 mr-2" />
                  Catalog
                </Link>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-700 hover:text-gray-900 hover:border-gray-300"
                >
                  <LayoutDashboard className="w-4 h-4 mr-2" />
                  Dashboard
                </Link>
                {(role === "ADMIN" || role === "OPERATOR") && (
                  <>
                    <Link
                      href="/inventory"
                      className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-700 hover:text-gray-900 hover:border-gray-300"
                    >
                      <ListFilter className="w-4 h-4 mr-2" />
                      Inventory
                    </Link>
                    <Link
                      href="/inventory/new"
                      className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-700 hover:text-gray-900 hover:border-gray-300"
                    >
                      <PlusCircle className="w-4 h-4 mr-2" />
                      Add Asset
                    </Link>
                  </>
                )}
                {role === "ADMIN" && (
                  <Link
                    href="/users"
                    className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-700 hover:text-gray-900 hover:border-gray-300"
                  >
                    <User className="w-4 h-4 mr-2" />
                    Users
                  </Link>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center">
            {session ? (
              <div className="flex items-center space-x-4">
                <div className="flex items-center text-sm font-medium text-gray-900">
                  <User className="w-4 h-4 mr-1 text-gray-600" />
                  {session.user?.name || session.user?.username || "User"}
                </div>
                <form
                  action={async () => {
                    "use server";
                    await signOut();
                  }}
                >
                  <button
                    type="submit"
                    className="flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-gray-700 hover:text-gray-900 hover:bg-gray-100"
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
                  className="text-sm font-medium text-gray-700 hover:text-indigo-600"
                >
                  Sign In
                </Link>
                <Link
                  href="/register"
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm"
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
