"use client";

import { useEffect, useState } from "react";
import { getPendingBookingsCount } from "@/app/actions/carbooking";
import { getPendingLeaveRequestsCount } from "@/app/actions/leave";
import { isOtManagerRole } from "@/lib/roles";
import MobileNavMenu from "./MobileNavMenu";
import NavDropdown, { type NavDropdownItem } from "./NavDropdown";

// Splits the two approver-only badge-count queries out of the server-rendered
// Navbar (which sits in the root layout and used to block *every* page's
// first paint on them) into a client-side fetch that runs after the nav has
// already rendered. Badges start at 0 and pop in a moment later instead of
// holding up the whole page.
export default function NavBadges({
  isLoggedIn,
  role,
  children,
}: {
  isLoggedIn: boolean;
  role?: string;
  /** Desktop-only links rendered before the dropdowns inside the same flex
   *  row (e.g. the always-visible Check-In link), so spacing stays
   *  consistent with a single flex container instead of two adjacent ones. */
  children?: React.ReactNode;
}) {
  const isApprover = role === "ADMIN" || role === "OPERATOR";
  const [pendingBookingsCount, setPendingBookingsCount] = useState(0);
  const [pendingLeaveCount, setPendingLeaveCount] = useState(0);

  useEffect(() => {
    if (!isApprover) return;
    let cancelled = false;
    Promise.all([getPendingBookingsCount(), getPendingLeaveRequestsCount()]).then(([bookings, leave]) => {
      if (cancelled) return;
      if (bookings.success) setPendingBookingsCount(bookings.data);
      if (leave.success) setPendingLeaveCount(leave.data);
    });
    return () => {
      cancelled = true;
    };
  }, [isApprover]);

  if (!isLoggedIn) {
    return (
      <>
        <MobileNavMenu isLoggedIn={false} pendingBookingsCount={0} pendingLeaveCount={0} />
        <div className="hidden sm:-my-px sm:ml-6 sm:flex sm:items-center sm:space-x-6">{children}</div>
      </>
    );
  }

  const workItems: NavDropdownItem[] = [
    { href: "/leave", label: "การลา", icon: "CalendarHeart", badge: pendingLeaveCount },
    { href: "/work-schedule", label: "ตารางงาน (Work Schedule)", icon: "CalendarRange" },
    { href: "/outside-trip", label: "ออกหน้างาน (Outside Trip)", icon: "MapPin" },
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
    { href: "/summary", label: "สรุปมื้อ + OT (Summary)", icon: "BarChart3" },
  ];

  return (
    <>
      <MobileNavMenu
        isLoggedIn
        role={role}
        pendingBookingsCount={pendingBookingsCount}
        pendingLeaveCount={pendingLeaveCount}
      />
      <div className="hidden sm:-my-px sm:ml-6 sm:flex sm:items-center sm:space-x-6">
        {children}
        <NavDropdown label="งาน" icon="Briefcase" items={workItems} badge={pendingLeaveCount} />
        <NavDropdown label="ทรัพยากร" icon="Boxes" items={resourceItems} badge={pendingBookingsCount} />
        <NavDropdown label="โปรเจกต์" icon="Cpu" items={projectItems} />
        {role === "ADMIN" && <NavDropdown label="ผู้ดูแลระบบ" icon="ShieldCheck" items={adminItems} />}
      </div>
    </>
  );
}
