"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, MapPin, Pencil, X, RotateCcw } from "lucide-react";
import { formatThaiDateLong, formatThaiTime } from "@/lib/datetime";
import { formatHoursTenths } from "@/lib/attendance";
import { setWageOverride, clearWageOverride } from "@/app/actions/wages";
import InternGradeSelect from "./InternGradeSelect";
import type { EmployeeWageReportRow } from "@/app/actions/wages";

function DayRateEditor({
  userId,
  dateKey,
  currentRate,
  onDone,
}: {
  userId: string;
  dateKey: string;
  currentRate: number;
  onDone: () => void;
}) {
  const [rate, setRate] = useState(String(currentRate));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const value = Number(rate);
    if (!Number.isFinite(value) || value < 0) {
      setError("ค่าแรงไม่ถูกต้อง");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await setWageOverride(userId, dateKey, value, note);
    if (!result.success) {
      setError(result.error || "บันทึกไม่สำเร็จ");
      setSaving(false);
      return;
    }
    onDone();
  };

  return (
    <span className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <input
        type="number"
        min={0}
        value={rate}
        onChange={(e) => setRate(e.target.value)}
        className="w-20 rounded border border-gray-300 px-1.5 py-0.5 text-xs focus:border-orange-500 focus:ring-orange-500 outline-none"
        autoFocus
      />
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="หมายเหตุ (ถ้ามี)"
        className="w-28 rounded border border-gray-300 px-1.5 py-0.5 text-xs focus:border-orange-500 focus:ring-orange-500 outline-none"
      />
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="px-2 py-0.5 rounded bg-orange-600 text-white text-[10px] font-semibold hover:bg-orange-700 disabled:opacity-50"
      >
        {saving ? "..." : "บันทึก"}
      </button>
      <button type="button" onClick={onDone} disabled={saving} className="text-gray-400 hover:text-gray-600">
        <X className="w-3.5 h-3.5" />
      </button>
      {error && <span className="text-red-600">{error}</span>}
    </span>
  );
}

export default function WageReportTable({ rows, gradeOptions }: { rows: EmployeeWageReportRow[]; gradeOptions: string[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingDay, setEditingDay] = useState<string | null>(null); // `${userId}|${dateKey}`

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
            <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-700 uppercase tracking-wider">อยู่ออฟฟิศ</th>
            <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-700 uppercase tracking-wider">ออกข้างนอก</th>
            <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-700 uppercase tracking-wider">OT (ชม.)</th>
            <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-700 uppercase tracking-wider">ค่า OT</th>
            <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-700 uppercase tracking-wider">ค่าแรงรวม</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {rows.map((row) => {
            const isOpen = expanded.has(row.userId);
            const officeDays = row.totalDays - row.outsideDays;
            return (
              <Fragment key={row.userId}>
                <tr onClick={() => toggle(row.userId)} className="hover:bg-gray-50 cursor-pointer">
                  <td className="px-4 py-2 text-gray-400">
                    {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </td>
                  <td className="px-4 py-2 text-sm font-medium text-gray-900" onClick={(e) => e.stopPropagation()}>
                    <Link href={`/users/${row.userId}`} className="hover:text-orange-600">
                      {row.employeeName}
                    </Link>
                  </td>
                  <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                    <div className="w-24">
                      <InternGradeSelect userId={row.userId} initialGrade={row.grade} gradeOptions={gradeOptions} />
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right text-sm text-gray-700">{row.totalDays}</td>
                  <td className="px-4 py-2 text-right text-sm text-gray-700">{officeDays}</td>
                  <td className="px-4 py-2 text-right text-sm text-gray-700">{row.outsideDays}</td>
                  <td className="px-4 py-2 text-right text-sm text-gray-700">{formatHoursTenths(row.totalOtHours)}</td>
                  <td className="px-4 py-2 text-right text-sm text-gray-700">{row.totalOtPay.toLocaleString()} บาท</td>
                  <td className="px-4 py-2 text-right text-sm font-semibold text-gray-900">
                    {row.totalWage.toLocaleString()} บาท
                  </td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={9} className="px-4 py-2 bg-gray-50/70">
                      <ul className="divide-y divide-gray-100 border border-gray-100 rounded-md overflow-hidden bg-white">
                        {row.days.map((d) => {
                          const dayKey = `${row.userId}|${d.dateKey}`;
                          const isEditing = editingDay === dayKey;
                          return (
                            <li key={d.dateKey} className="px-3 py-1.5 flex items-center justify-between text-xs gap-2">
                              <span className="text-gray-700 shrink-0">{formatThaiDateLong(d.dateKey)}</span>
                              {isEditing ? (
                                <DayRateEditor
                                  userId={row.userId}
                                  dateKey={d.dateKey}
                                  currentRate={d.rate}
                                  onDone={() => setEditingDay(null)}
                                />
                              ) : (
                                <span className="flex items-center gap-2 flex-wrap justify-end">
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
                                  {d.wentOutside &&
                                    (d.outsideStartTime && d.outsideEndTime ? (
                                      <>
                                        {d.workStartTime && d.workEndTime && (
                                          <span className="text-gray-400">
                                            ทำงาน {formatThaiTime(d.workStartTime)}–{formatThaiTime(d.workEndTime)}
                                          </span>
                                        )}
                                        <span className="text-gray-400">
                                          ออกหน้างาน {formatThaiTime(d.outsideStartTime)}–{formatThaiTime(d.outsideEndTime)}
                                        </span>
                                      </>
                                    ) : (
                                      d.workStartTime &&
                                      d.workEndTime && (
                                        <span className="text-gray-400">
                                          {formatThaiTime(d.workStartTime)}–{formatThaiTime(d.workEndTime)}
                                        </span>
                                      )
                                    ))}
                                  {!d.overridden && <span className="text-gray-500">{d.baseRate.toLocaleString()} บาท</span>}
                                  {!d.overridden && d.otHours > 0 && (
                                    <span className="text-orange-600">
                                      +OT {formatHoursTenths(d.otHours)} ชม. ({d.otPay.toLocaleString()} บาท)
                                    </span>
                                  )}
                                  {d.overridden && (
                                    <span
                                      className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-semibold"
                                      title={
                                        d.overrideNote
                                          ? `${d.overrideNote} (เดิม ${d.originalRate?.toLocaleString()} บาท)`
                                          : `แก้ไขโดยแอดมิน (เดิม ${d.originalRate?.toLocaleString()} บาท)`
                                      }
                                    >
                                      แก้ไขแล้ว
                                    </span>
                                  )}
                                  <span className="font-semibold text-gray-900">{d.rate.toLocaleString()} บาท</span>
                                  <button
                                    type="button"
                                    onClick={() => setEditingDay(dayKey)}
                                    className="text-gray-400 hover:text-orange-600"
                                    title="แก้ไขค่าแรงวันนี้"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                  {d.overridden && (
                                    <button
                                      type="button"
                                      onClick={() => clearWageOverride(row.userId, d.dateKey)}
                                      className="text-gray-400 hover:text-red-600"
                                      title="ยกเลิกการแก้ไข กลับไปใช้ค่าที่คำนวณอัตโนมัติ"
                                    >
                                      <RotateCcw className="w-3 h-3" />
                                    </button>
                                  )}
                                </span>
                              )}
                            </li>
                          );
                        })}
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
            <td colSpan={7} className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
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
