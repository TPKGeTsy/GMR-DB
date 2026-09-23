"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, MapPin } from "lucide-react";
import { formatThaiDateLong } from "@/lib/datetime";
import type { EmployeeWageReportRow } from "@/app/actions/wages";

const GRADE_BADGE_STYLES: Record<string, string> = {
  A: "bg-emerald-100 text-emerald-700",
  B: "bg-amber-100 text-amber-700",
  C: "bg-rose-100 text-rose-700",
};

export default function WageReportTable({ rows }: { rows: EmployeeWageReportRow[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (userId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  if (rows.length === 0) {
    return <p className="px-6 py-10 text-center text-sm text-gray-400 italic">ไม่มีเด็กฝึกงานที่เช็คอินในช่วงนี้</p>;
  }

  const grandTotal = rows.reduce((sum, r) => sum + r.totalWage, 0);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left text-[10px] font-medium text-gray-700 uppercase tracking-wider" />
            <th className="px-4 py-2 text-left text-[10px] font-medium text-gray-700 uppercase tracking-wider">พนักงาน</th>
            <th className="px-4 py-2 text-left text-[10px] font-medium text-gray-700 uppercase tracking-wider">เกรด</th>
            <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-700 uppercase tracking-wider">วันทำงาน</th>
            <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-700 uppercase tracking-wider">วันออกข้างนอก</th>
            <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-700 uppercase tracking-wider">ค่าแรงรวม</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {rows.map((row) => {
            const isOpen = expanded.has(row.userId);
            return (
              <Fragment key={row.userId}>
                <tr
                  onClick={() => toggle(row.userId)}
                  className="hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-2 text-gray-400">
                    {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </td>
                  <td className="px-4 py-2 text-sm font-medium text-gray-900">{row.employeeName}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${GRADE_BADGE_STYLES[row.grade]}`}>
                      {row.grade}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right text-sm text-gray-700">{row.totalDays}</td>
                  <td className="px-4 py-2 text-right text-sm text-gray-700">{row.outsideDays}</td>
                  <td className="px-4 py-2 text-right text-sm font-semibold text-gray-900">
                    {row.totalWage.toLocaleString()} บาท
                  </td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={6} className="px-4 py-2 bg-gray-50/70">
                      <ul className="divide-y divide-gray-100 border border-gray-100 rounded-md overflow-hidden bg-white">
                        {row.days.map((d) => (
                          <li key={d.dateKey} className="px-3 py-1.5 flex items-center justify-between text-xs">
                            <span className="text-gray-700">{formatThaiDateLong(d.dateKey)}</span>
                            <span className="flex items-center gap-2">
                              <span
                                className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                                  d.wentOutside ? "bg-yellow-100 text-yellow-800" : "bg-blue-100 text-blue-700"
                                }`}
                              >
                                <MapPin className="w-2.5 h-2.5 mr-1" />
                                {d.wentOutside ? "ออกข้างนอก" : "ในออฟฟิศ"}
                              </span>
                              <span className="font-semibold text-gray-900">{d.rate.toLocaleString()} บาท</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot className="bg-gray-50">
          <tr>
            <td colSpan={5} className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
              รวมทั้งหมด
            </td>
            <td className="px-4 py-2 text-right text-sm font-bold text-orange-600">{grandTotal.toLocaleString()} บาท</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
