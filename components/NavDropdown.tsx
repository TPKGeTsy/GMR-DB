"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronDown, LayoutDashboard, ListFilter, User, ShoppingBag, Cpu, Share2,
  ClipboardList, PackageCheck, Car, Briefcase, CalendarRange, CalendarHeart,
  Boxes, ShieldCheck, type LucideIcon,
} from "lucide-react";

// Icons must be resolved here (inside the Client Component) rather than passed
// in as elements from the Server Component — lucide-react icons are
// forwardRef components, which React's RSC serializer cannot eagerly render
// across the server->client prop boundary the way it can plain elements.
// Passing a lookup key instead keeps the props trivially serializable.
const ICONS = {
  LayoutDashboard, ListFilter, User, ShoppingBag, Cpu, Share2,
  ClipboardList, PackageCheck, Car, Briefcase, CalendarRange, CalendarHeart,
  Boxes, ShieldCheck,
} satisfies Record<string, LucideIcon>;

export type NavIconName = keyof typeof ICONS;

export interface NavDropdownItem {
  href: string;
  label: string;
  icon: NavIconName;
  badge?: number;
}

export default function NavDropdown({
  label,
  icon,
  items,
  badge,
}: {
  label: string;
  icon: NavIconName;
  items: NavDropdownItem[];
  badge?: number;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const TriggerIcon = ICONS[icon];

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-300 hover:text-orange-400 hover:border-orange-500 transition-colors"
        aria-expanded={open}
      >
        <TriggerIcon className="w-4 h-4 mr-1" />
        {label}
        <ChevronDown className={`w-3.5 h-3.5 ml-1 transition-transform ${open ? "rotate-180" : ""}`} />
        {!!badge && badge > 0 && (
          <span className="absolute -top-1.5 -right-2.5 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-56 bg-gray-950 border border-gray-800 rounded-md shadow-lg py-1.5 z-30">
          {items.map((item) => {
            const ItemIcon = ICONS[item.icon];
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800 hover:text-orange-400 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <ItemIcon className="w-4 h-4" />
                  {item.label}
                </span>
                {!!item.badge && item.badge > 0 && (
                  <span className="flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
