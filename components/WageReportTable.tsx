"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, MapPin } from "lucide-react";
import { formatThaiDateLong } from "@/lib/datetime";
import InternGradeSelect from "./InternGradeSelect";
import type { EmployeeWageReportRow } from "@/app/actions/wages";

export default function WageReportTable({ rows, gradeOptions }: { rows: EmployeeWageReportRow[]; gradeOptions: string[] }) {
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

  const grandTotalOtPay = rows.reduce((sum, r) => sum + r.totalOtPay, 0);
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
            <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-700 uppercase tracking-wider">OT (ชม.)</th>
            <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-700 uppercase tracking-wider">ค่า OT</th>
            <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-700 uppercase tracking-wider">ค่าแรงรวม</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {rows.map((row) => {
            const isOpen = expanded.has(row.userId);
            return (
              <Fragment key={row.userId}>
                <tr onClick={() => toggle(row.userId)} className="hover:bg-gray-50 cursor-pointer">
                  <td className="px-4 py-2 text-gray-400">
                    {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </td>
                  <td className="px-4 py-2 text-sm font-medium text-gray-900">{row.employeeName}</td>
                  <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                    <div className="w-24">
                      <InternGradeSelect userId={row.userId} initialGrade={row.grade} gradeOptions={gradeOptions} />
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right text-sm text-gray-700">{row.totalDays}</td>
                  <td className="px-4 py-2 text-right text-sm text-gray-700">{row.outsideDays}</td>
                  <td className="px-4 py-2 text-right text-sm text-gray-700">{row.totalOtHours.toFixed(1)}</td>
                  <td className="px-4 py-2 text-right text-sm text-gray-700">{row.totalOtPay.toLocaleString()} บาท</td>
                  <td className="px-4 py-2 text-right text-sm font-semibold text-gray-900">
                    {row.totalWage.toLocaleString()} บาท
                  </td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={8} className="px-4 py-2 bg-gray-50/70">
                      <ul className="divide-y divide-gray-100 border border-gray-100 rounded-md overflow-hidden bg-white">
                        {row.days.map((d) => (
                          <li key={d.dateKey} className="px-3 py-1.5 flex items-center justify-between text-xs">
                            <span className="text-gray-700">{formatThaiDateLong(d.dateKey)}</span>
                            <span className="flex items-center gap-2">
                              <span
                                className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                                  d.wentOutside ? "bg-yellow-100 text-yellow-800" : "bg-blue-100 text-blue-700"
                                }`}
                                title={d.note || undefined}
                              >
                                <MapPin className="w-2.5 h-2.5 mr-1" />
                                {d.wentOutside ? "ออกข้างนอก" : "ในออฟฟิศ"}
                              </span>
                              {d.note && <span className="text-gray-400 italic">({d.note})</span>}
                              <span className="text-gray-500">{d.baseRate.toLocaleString()} บาท</span>
                              {d.otHours > 0 && (
                                <span className="text-orange-600">
                                  +OT {d.otHours.toFixed(1)} ชม. ({d.otPay.toLocaleString()} บาท)
                                </span>
                              )}
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
            <td colSpan={6} className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
              รวมทั้งหมด
            </td>
            <td className="px-4 py-2 text-right text-sm font-bold text-orange-600">{grandTotalOtPay.toLocaleString()} บาท</td>
            <td className="px-4 py-2 text-right text-sm font-bold text-orange-600">{grandTotal.toLocaleString()} บาท</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
