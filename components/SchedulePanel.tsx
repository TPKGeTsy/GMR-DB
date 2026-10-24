"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Pencil, Plus, Trash2 } from "lucide-react";
import {
  createSchedule,
  deleteSchedule,
  getSchedules,
  setScheduleEnabled,
  updateSchedule,
  type ScheduleActionResult,
} from "@/app/actions/modbusSchedule";
import { ALL_DAYS, WEEKDAY_LABELS, describeDays, type ScheduleAction, type ScheduleRow } from "@/lib/modbusSchedule";
import { FLOOR_MAPS, ZONE_BY_ID, channelAssignments } from "@/lib/zones";

const inputClass =
  "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";

interface FormState {
  id: string | null; // null = adding a new one
  title: string;
  time: string;
  days: number[];
  action: ScheduleAction;
  channels: number[];
}

const emptyForm = (): FormState => ({ id: null, title: "", time: "18:00", days: [...ALL_DAYS], action: "OFF", channels: [] });

/**
 * The "ตั้งเวลา" tab: timers that switch channels ON or OFF at a set time on
 * chosen weekdays. Everyone can see them; ADMIN / OPERATOR add and change them.
 * (They are carried out by the cron job calling /api/cron/modbus-schedule.)
 */
export default function SchedulePanel({ channelCount, canConfigure }: { channelCount: number; canConfigure: boolean }) {
  const [schedules, setSchedules] = useState<ScheduleRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  const names = useMemo(() => channelAssignments(channelCount), [channelCount]);

  // Channels grouped like the floor-plan tabs, so "everything in Hibay" is a single tap.
  const groups = useMemo(() => {
    const placed = new Set<number>();
    const result = FLOOR_MAPS.map((map) => {
      const channels = map.shapes
        .map((s) => ZONE_BY_ID[s.zoneId]?.channel)
        .filter((c): c is number => typeof c === "number")
        .sort((a, b) => a - b);
      channels.forEach((c) => placed.add(c));
      return { id: map.id, title: map.title, channels };
    });
    const spare = Array.from({ length: channelCount }, (_, c) => c).filter((c) => !placed.has(c));
    return { maps: result, spare };
  }, [channelCount]);

  const load = useCallback(async () => {
    const result = await getSchedules();
    if (result.success) {
      setSchedules(result.schedules);
      setError(null);
    } else {
      setError(result.error);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const apply = (result: ScheduleActionResult) => {
    if (result.success) {
      setSchedules(result.schedules);
      setError(null);
      return true;
    }
    setError(result.error);
    return false;
  };

  const toggleChannel = (c: number) =>
    setForm((f) => (f ? { ...f, channels: f.channels.includes(c) ? f.channels.filter((x) => x !== c) : [...f.channels, c] } : f));

  const setGroup = (channels: number[], on: boolean) =>
    setForm((f) => {
      if (!f) return f;
      const rest = f.channels.filter((c) => !channels.includes(c));
      return { ...f, channels: on ? [...rest, ...channels] : rest };
    });

  const toggleDay = (d: number) =>
    setForm((f) => (f ? { ...f, days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d] } : f));

  const save = async () => {
    if (!form) return;
    setSaving(true);
    const payload = { title: form.title, time: form.time, days: form.days, action: form.action, channels: form.channels };
    const result = form.id ? await updateSchedule(form.id, payload) : await createSchedule(payload);
    setSaving(false);
    if (apply(result)) setForm(null);
  };

  const label = (c: number) => `${names[c]?.name ?? `CH${c + 1}`}`;
  const summary = (channels: number[]) => {
    const shown = channels.slice(0, 4).map(label).join(", ");
    return channels.length > 4 ? `${shown} +${channels.length - 4}` : shown;
  };

  const renderGroup = (title: string, channels: number[]) => {
    const allOn = channels.length > 0 && channels.every((c) => form?.channels.includes(c));
    return (
      <div key={title} className="rounded-lg border border-gray-200 p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-gray-700">{title}</p>
          <button type="button" onClick={() => setGroup(channels, !allOn)} className="text-xs text-orange-600 hover:underline">
            {allOn ? "ล้างกลุ่มนี้" : "เลือกทั้งกลุ่ม"}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {channels.map((c) => {
            const picked = form?.channels.includes(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggleChannel(c)}
                aria-pressed={picked}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  picked ? "border-orange-500 bg-orange-500 text-white" : "border-gray-300 bg-white text-gray-600 hover:border-orange-400"
                }`}
              >
                {label(c)} <span className="opacity-70">CH{c + 1}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-gray-600">
          <CalendarClock className="h-4 w-4 text-orange-500" />
          สั่งเปิด/ปิดไฟอัตโนมัติตามเวลา (เวลาประเทศไทย) — ทำงานครั้งเดียวต่อวันตามวันที่เลือก
        </p>
        {canConfigure && !form && (
          <button
            type="button"
            onClick={() => setForm(emptyForm())}
            className="inline-flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600"
          >
            <Plus className="h-4 w-4" />
            เพิ่มเวลา
          </button>
        )}
      </div>

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {form && (
        <div className="mb-6 rounded-xl border border-orange-200 bg-orange-50/40 p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-800">{form.id ? "แก้ไขเวลา" : "เพิ่มเวลา"}</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm font-medium text-gray-700 sm:col-span-2">
              หัวข้อ (ไม่บังคับ)
              <input
                value={form.title}
                maxLength={60}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="เช่น ปิดไฟหลังเลิกงาน"
                className={inputClass}
              />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              เวลา
              <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className={inputClass} />
            </label>
          </div>

          <div className="mt-3">
            <p className="text-sm font-medium text-gray-700">ทำอะไร</p>
            <div className="mt-1 inline-flex rounded-lg border border-gray-300 bg-white p-1 text-sm">
              {(["ON", "OFF"] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setForm({ ...form, action: a })}
                  className={`rounded-md px-4 py-1.5 font-medium ${
                    form.action === a ? (a === "ON" ? "bg-green-500 text-white" : "bg-gray-700 text-white") : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {a === "ON" ? "เปิดไฟ" : "ปิดไฟ"}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3">
            <p className="text-sm font-medium text-gray-700">วัน</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(d)}
                  aria-pressed={form.days.includes(d)}
                  className={`h-8 w-10 rounded-md border text-xs font-medium ${
                    form.days.includes(d) ? "border-orange-500 bg-orange-500 text-white" : "border-gray-300 bg-white text-gray-600"
                  }`}
                >
                  {WEEKDAY_LABELS[d]}
                </button>
              ))}
              <button type="button" onClick={() => setForm({ ...form, days: [...ALL_DAYS] })} className="px-2 text-xs text-orange-600 hover:underline">
                ทุกวัน
              </button>
              <button type="button" onClick={() => setForm({ ...form, days: [1, 2, 3, 4, 5] })} className="px-2 text-xs text-orange-600 hover:underline">
                จ.–ศ.
              </button>
            </div>
          </div>

          <div className="mt-3">
            <p className="mb-1 text-sm font-medium text-gray-700">ไฟ / ช่องที่จะสั่ง ({form.channels.length} ช่อง)</p>
            <div className="space-y-2">
              {groups.maps.map((g) => renderGroup(g.title, g.channels))}
              {groups.spare.length > 0 && (
                <details className="rounded-lg border border-gray-200 p-3">
                  <summary className="cursor-pointer text-sm font-medium text-gray-500">ช่องสำรอง / ยังไม่ได้ลงทะเบียน ({groups.spare.length})</summary>
                  <div className="mt-2">{renderGroup("ช่องสำรอง", groups.spare)}</div>
                </details>
              )}
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setForm(null)} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-md bg-orange-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          </div>
        </div>
      )}

      {schedules === null && !error ? (
        <p className="text-sm text-gray-500">กำลังโหลด…</p>
      ) : schedules && schedules.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
          ยังไม่มีการตั้งเวลา{canConfigure ? " — กด “เพิ่มเวลา” เพื่อเริ่ม" : ""}
        </p>
      ) : (
        schedules && (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-500">
                  <th className="px-4 py-2 font-medium">เวลา</th>
                  <th className="px-2 py-2 font-medium">ทำอะไร</th>
                  <th className="px-2 py-2 font-medium">ไฟ / ช่อง</th>
                  <th className="px-2 py-2 font-medium">วัน</th>
                  <th className="px-2 py-2 font-medium">ใช้งาน</th>
                  {canConfigure && <th className="px-4 py-2" />}
                </tr>
              </thead>
              <tbody>
                {schedules.map((s) => (
                  <tr key={s.id} className={`border-t border-gray-100 ${s.enabled ? "" : "opacity-50"}`}>
                    <td className="px-4 py-2.5">
                      <div className="text-base font-semibold tabular-nums text-gray-900">{s.time}</div>
                      {s.title && <div className="text-xs text-gray-500">{s.title}</div>}
                    </td>
                    <td className="px-2 py-2.5">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.action === "ON" ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-700"}`}>
                        {s.action === "ON" ? "เปิดไฟ" : "ปิดไฟ"}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-gray-700" title={s.channels.map(label).join(", ")}>
                      {summary(s.channels)} <span className="text-xs text-gray-400">({s.channels.length})</span>
                    </td>
                    <td className="px-2 py-2.5 text-gray-600">{describeDays(s.days)}</td>
                    <td className="px-2 py-2.5">
                      {canConfigure ? (
                        <button
                          type="button"
                          role="switch"
                          aria-checked={s.enabled}
                          aria-label={`${s.enabled ? "ปิด" : "เปิด"}ใช้งานเวลา ${s.time}`}
                          onClick={async () => apply(await setScheduleEnabled(s.id, !s.enabled))}
                          className={`relative h-5 w-9 rounded-full transition-colors ${s.enabled ? "bg-green-500" : "bg-gray-300"}`}
                        >
                          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${s.enabled ? "left-[18px]" : "left-0.5"}`} />
                        </button>
                      ) : (
                        <span className="text-xs text-gray-600">{s.enabled ? "ใช้งาน" : "ปิด"}</span>
                      )}
                    </td>
                    {canConfigure && (
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => setForm({ id: s.id, title: s.title, time: s.time, days: s.days, action: s.action, channels: s.channels })}
                          className="mr-1 rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          aria-label={`แก้เวลา ${s.time}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (window.confirm(`ลบเวลา ${s.time}${s.title ? ` (${s.title})` : ""}?`)) apply(await deleteSchedule(s.id));
                          }}
                          className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                          aria-label={`ลบเวลา ${s.time}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
