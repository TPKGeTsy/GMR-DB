"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Menu, X, LayoutDashboard, ListFilter, User, ShoppingBag, Cpu, Share2,
  ScanFace, ClipboardList, PackageCheck, Car, Briefcase, CalendarRange,
} from "lucide-react";

const linkClass =
  "flex items-center gap-2.5 px-3 py-3 rounded-md text-sm font-medium text-gray-200 hover:bg-gray-800 hover:text-orange-400 transition-colors";

export default function MobileNavMenu({
  isLoggedIn,
  role,
  isApprover,
  pendingCount,
}: {
  isLoggedIn: boolean;
  role?: string;
  isApprover: boolean;
  pendingCount: number;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <div className="sm:hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-center w-10 h-10 text-gray-300 hover:text-white"
        aria-label={open ? "ปิดเมนู" : "เปิดเมนู"}
      >
        {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-16 bg-gray-950 border-b border-gray-800 shadow-lg px-3 py-3 space-y-0.5 max-h-[calc(100vh-4rem)] overflow-y-auto z-20">
          <Link href="/checkin" className={linkClass} onClick={close}>
            <ScanFace className="w-4 h-4" />
            Check-In
          </Link>

          {isLoggedIn && (
            <>
              <Link href="/catalog" className={linkClass} onClick={close}>
                <ShoppingBag className="w-4 h-4" />
                Catalog
              </Link>
              <Link href="/my-loans" className={linkClass} onClick={close}>
                <PackageCheck className="w-4 h-4" />
                My Loans
              </Link>
              <Link href="/carbook" className={`${linkClass} justify-between`} onClick={close}>
                <span className="flex items-center gap-2.5">
                  <Car className="w-4 h-4" />
                  Car Booking
                </span>
                {isApprover && pendingCount > 0 && (
                  <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
                    {pendingCount}
                  </span>
                )}
              </Link>
              <Link href="/projects" className={linkClass} onClick={close}>
                <Briefcase className="w-4 h-4" />
                Projects
              </Link>
              <Link href="/work-schedule" className={linkClass} onClick={close}>
                <CalendarRange className="w-4 h-4" />
                Work Schedule
              </Link>
              <Link href="/dashboard" className={linkClass} onClick={close}>
                <LayoutDashboard className="w-4 h-4" />
                Dashboard
              </Link>
              <Link href="/circuit" className={linkClass} onClick={close}>
                <Cpu className="w-4 h-4" />
                Circuit
              </Link>
              <Link href="/diagrams" className={linkClass} onClick={close}>
                <Share2 className="w-4 h-4" />
                Wiring
              </Link>
              {(role === "ADMIN" || role === "OPERATOR") && (
                <Link href="/inventory" className={linkClass} onClick={close}>
                  <ListFilter className="w-4 h-4" />
                  Inventory
                </Link>
              )}
              {role === "ADMIN" && (
                <>
                  <Link href="/users" className={linkClass} onClick={close}>
                    <User className="w-4 h-4" />
                    Users
                  </Link>
                  <Link href="/attendance" className={linkClass} onClick={close}>
                    <ClipboardList className="w-4 h-4" />
                    Attendance
                  </Link>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
