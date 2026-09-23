"use client";

import { useSearchParams, usePathname, useRouter } from "next/navigation";

export default function CategoryFilter({ categories }: { categories: string[] }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { replace } = useRouter();

  const handleChange = (category: string) => {
    const params = new URLSearchParams(searchParams);
    params.delete("page"); // Reset to page 1 on filter change
    if (category) params.set("category", category);
    else params.delete("category");
    replace(`${pathname}?${params.toString()}`);
  };

  return (
    <select
      value={searchParams.get("category") || ""}
      onChange={(e) => handleChange(e.target.value)}
      className="block rounded-md border border-gray-200 py-[9px] pl-3 pr-8 text-sm text-gray-700 outline-2 focus:border-orange-500 focus:ring-orange-500"
    >
      <option value="">ทุกหมวดหมู่</option>
      {categories.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}
