"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, User, Loader2, History } from "lucide-react";
import { suggestLaborVendors, type VendorSuggestion } from "@/app/actions/laborHire";
import { formatThaiDateLong } from "@/lib/datetime";
import { workerRoleLabel } from "@/lib/laborHire";

/** A text input that suggests companies/people we've hired before in a
 *  dropdown right under it. Typing searches the existing hire log with a
 *  case-insensitive "contains" match on every word; focusing an empty field
 *  lists the most recently hired. Picking one is up to the caller (fill a
 *  vendor, add a worker...) via onPick. */
export default function NameSuggest({
  value,
  onChange,
  onPick,
  kinds,
  className,
  placeholder,
  maxLength,
  required,
}: {
  value: string;
  onChange: (text: string) => void;
  onPick: (suggestion: VendorSuggestion) => void;
  /** Only suggest these kinds (e.g. just people for a worker-name field). */
  kinds?: VendorSuggestion["kind"][];
  className?: string;
  placeholder?: string;
  maxLength?: number;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<VendorSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const requestId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const search = (query: string) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const id = ++requestId.current;
      setLoading(true);
      const result = await suggestLaborVendors(query);
      // A newer keystroke already started another search — drop this answer.
      if (id !== requestId.current) return;
      setLoading(false);
      setSearched(true);
      const data = result.success ? result.data : [];
      setItems(kinds ? data.filter((e) => kinds.includes(e.kind)) : data);
    }, 250);
  };

  const hasText = value.trim() !== "";

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          search(e.target.value);
        }}
        onFocus={() => {
          setOpen(true);
          search(value);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder={placeholder}
        maxLength={maxLength}
        required={required}
        autoComplete="off"
        className={className}
      />

      {open && (loading || items.length > 0 || (searched && hasText)) && (
        <div className="absolute z-30 left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
          {loading && items.length === 0 ? (
            <p className="flex items-center gap-2 px-3 py-2 text-xs text-gray-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              กำลังค้นหา...
            </p>
          ) : items.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400">ไม่พบประวัติการจ้างที่คล้ายกัน — จะบันทึกเป็นรายใหม่</p>
          ) : (
            <>
              <p className="flex items-center gap-1 px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                <History className="w-3 h-3" />
                {hasText ? "เคยจ้างมาแล้ว — คล้ายกับที่พิมพ์" : "จ้างล่าสุด"}
              </p>
              <ul>
                {items.map((s) => (
                  <li key={s.key}>
                    <button
                      type="button"
                      // mousedown, not click: the input's blur would close the list first.
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onPick(s);
                        setOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-orange-50 flex items-start gap-2.5 transition-colors"
                    >
                      <span
                        className={`flex-shrink-0 mt-0.5 w-7 h-7 rounded-full flex items-center justify-center ${
                          s.kind === "COMPANY" ? "bg-blue-50 text-blue-600" : "bg-purple-50 text-purple-600"
                        }`}
                      >
                        {s.kind === "COMPANY" ? <Building2 className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-gray-900 truncate">{s.name}</span>
                        <span className="block text-[11px] text-gray-500">
                          {s.kind === "COMPANY" ? "บริษัท/ผู้รับเหมา" : "บุคคล"} · เคยจ้าง {s.times} ครั้ง · ล่าสุด{" "}
                          {formatThaiDateLong(s.lastDateKey)}
                        </span>
                        {(s.phone || s.trade || s.lastRate !== null) && (
                          <span className="block text-[11px] text-gray-400 truncate">
                            {[
                              s.phone,
                              s.trade,
                              s.lastRate !== null
                                ? `${s.lastRole ? workerRoleLabel[s.lastRole] + " " : ""}฿${s.lastRate.toLocaleString("th-TH")}/วัน`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
