"use client";

import { BAR_LENGTH_OPTIONS } from "@/lib/steel";

/** Bar length choices: 1,000 - 20,000 mm in steps of 1,000 (a value outside the
 *  list, e.g. a typed offcut length, is kept as an extra option). */
export default function BarLengthSelect({
  value,
  onChange,
  disabled,
  className = "",
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  const options = BAR_LENGTH_OPTIONS.includes(value) ? BAR_LENGTH_OPTIONS : [...BAR_LENGTH_OPTIONS, value].sort((a, b) => a - b);
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`rounded border border-gray-300 px-2 py-1 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 ${className}`}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o.toLocaleString("th-TH")} มม.
        </option>
      ))}
    </select>
  );
}
