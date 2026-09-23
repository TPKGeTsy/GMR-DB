"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Menu, X, LayoutDashboard, ListFilter, User, ShoppingBag, Cpu, Share2,
  ScanFace, ClipboardList, PackageCheck, Car, Briefcase, CalendarRange, CalendarHeart, Timer, BarChart3, Wallet,
} from "lucide-react";
import { isOtManagerRole } from "@/lib/roles";

const linkClass =
  "flex items-center gap-2.5 px-3 py-3 rounded-md text-sm font-medium text-gray-200 hover:bg-gray-800 hover:text-orange-400 transition-colors";

const sectionHeaderClass =
  "px-3 pt-3 pb-1 text-[10px] font-semibold text-gray-500 uppercase tracking-wider";

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
      {count}
    </span>
  );
}

export default function MobileNavMenu({
  isLoggedIn,
  role,
  pendingBookingsCount,
  pendingLeaveCount,
}: {
  isLoggedIn: boolean;
  role?: string;
  pendingBookingsCount: number;
  pendingLeaveCount: number;
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
            Check-In (สแกนหน้าเข้างาน)
          </Link>

          {isLoggedIn && (
            <>
              <p className={sectionHeaderClass}>งาน</p>
              <Link href="/leave" className={`${linkClass} justify-between`} onClick={close}>
                <span className="flex items-center gap-2.5">
                  <CalendarHeart className="w-4 h-4" />
                  การลา
                </span>
                <Badge count={pendingLeaveCount} />
              </Link>
              <Link href="/work-schedule" className={linkClass} onClick={close}>
                <CalendarRange className="w-4 h-4" />
                ตารางงาน (Work Schedule)
              </Link>
              {isOtManagerRole(role) && (
                <>
                  <Link href="/ot" className={linkClass} onClick={close}>
                    <Timer className="w-4 h-4" />
                    OT
                  </Link>
                  <Link href="/ot/summary" className={linkClass} onClick={close}>
                    <BarChart3 className="w-4 h-4" />
                    สรุป OT (OT Summary)
                  </Link>
                </>
              )}

              <p className={sectionHeaderClass}>ทรัพยากร</p>
              <Link href="/dashboard" className={linkClass} onClick={close}>
                <LayoutDashboard className="w-4 h-4" />
                Dashboard (ภาพรวม)
              </Link>
              <Link href="/catalog" className={linkClass} onClick={close}>
                <ShoppingBag className="w-4 h-4" />
                Catalog (รายการอุปกรณ์)
              </Link>
              <Link href="/my-loans" className={linkClass} onClick={close}>
                <PackageCheck className="w-4 h-4" />
                My Loans (ของที่ยืม)
              </Link>
              <Link href="/carbook" className={`${linkClass} justify-between`} onClick={close}>
                <span className="flex items-center gap-2.5">
                  <Car className="w-4 h-4" />
                  Car Booking (จองรถ)
                </span>
                <Badge count={pendingBookingsCount} />
              </Link>
              {(role === "ADMIN" || role === "OPERATOR") && (
                <Link href="/inventory" className={linkClass} onClick={close}>
                  <ListFilter className="w-4 h-4" />
                  Inventory (คลังอุปกรณ์)
                </Link>
              )}

              <p className={sectionHeaderClass}>โปรเจกต์</p>
              <Link href="/projects" className={linkClass} onClick={close}>
                <Briefcase className="w-4 h-4" />
                Projects (โปรเจกต์)
              </Link>
              <Link href="/circuit" className={linkClass} onClick={close}>
                <Cpu className="w-4 h-4" />
                Circuit (วงจรไฟฟ้า)
              </Link>
              <Link href="/diagrams" className={linkClass} onClick={close}>
                <Share2 className="w-4 h-4" />
                Wiring (การเดินสาย)
              </Link>

              {role === "ADMIN" && (
                <>
                  <p className={sectionHeaderClass}>ผู้ดูแลระบบ</p>
                  <Link href="/users" className={linkClass} onClick={close}>
                    <User className="w-4 h-4" />
                    Users (ผู้ใช้งาน)
                  </Link>
                  <Link href="/attendance" className={linkClass} onClick={close}>
                    <ClipboardList className="w-4 h-4" />
                    Attendance Report (รายงานเข้างาน)
                  </Link>
                  <Link href="/wages" className={linkClass} onClick={close}>
                    <Wallet className="w-4 h-4" />
                    ค่าแรงเด็กฝึกงาน (Wages)
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
