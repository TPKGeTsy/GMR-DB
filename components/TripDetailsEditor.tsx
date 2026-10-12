"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Clock, MapPin, Pencil, Plus, X } from "lucide-react";
import { updateOutsideTripDetails } from "@/app/actions/outsideTripEdit";
import { bangkokDateKey, bangkokTimeHHMM, formatThaiTime } from "@/lib/datetime";

interface Member {
  userId: string;
  name: string;
  outAt: string;
  backAt: string | null;
}

interface Employee {
  id: string;
  name: string;
}

// datetime-local works in "wall clock" terms — always Bangkok here (the
// whole app is), so convert both ways with the fixed +07:00 offset.
const toInput = (iso: string) => `${bangkokDateKey(new Date(iso))}T${bangkokTimeHHMM(iso)}`;
const fromInput = (v: string) => new Date(`${v}:00+07:00`).toISOString();

type Times = { out: string; back: string };

const initialTimes = (members: Member[]): Record<string, Times> =>
  Object.fromEntries(members.map((m) => [m.userId, { out: toInput(m.outAt), back: m.backAt ? toInput(m.backAt) : "" }]));

const inputClass = "rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none";

/** The trip's place name, who was on it, and each member's leave/return
 *  time: shown as before, switchable into edit mode (the page itself is
 *  admin-only). Edit mode can also add or remove people. */
export default function TripDetailsEditor({
  tripId,
  location,
  members,
  employees,
}: {
  tripId: string;
  location: string;
  members: Member[];
  employees: Employee[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [place, setPlace] = useState(location);
  const [times, setTimes] = useState(() => initialTimes(members));
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<{ userId: string; name: string }[]>([]);
  const [pick, setPick] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setTime = (userId: string, key: keyof Times, value: string) =>
    setTimes((t) => ({ ...t, [userId]: { ...t[userId], [key]: value } }));

  const toggleRemoved = (userId: string) =>
    setRemoved((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });

  // Anyone not already on the trip (and not just added) can be picked; a
  // person who was removed in this edit is "un-removed" via their row, not here.
  const onTrip = new Set([...members.map((m) => m.userId), ...added.map((a) => a.userId)]);
  const pickable = employees.filter((e) => !onTrip.has(e.id));

  const addPerson = () => {
    const emp = employees.find((e) => e.id === pick);
    if (!emp) return;
    // New people default to the same times as the first person on the trip —
    // the usual case is "forgot to tick a few teammates".
    const template = members.find((m) => !removed.has(m.userId)) ?? members[0];
    const base = times[template?.userId] ?? { out: "", back: "" };
    setTimes((t) => ({ ...t, [emp.id]: { out: base.out, back: base.back } }));
    setAdded((a) => [...a, { userId: emp.id, name: emp.name }]);
    setPick("");
  };

  const dropAdded = (userId: string) => setAdded((a) => a.filter((x) => x.userId !== userId));

  const save = async () => {
    setError(null);
    const bad = added.find((a) => !times[a.userId]?.out);
    if (bad) {
      setError(`ใส่เวลาออกของ ${bad.name} ด้วย`);
      return;
    }
    setSaving(true);
    const result = await updateOutsideTripDetails(tripId, {
      location: place,
      members: members
        .filter((m) => !removed.has(m.userId))
        .map((m) => ({
          userId: m.userId,
          outAt: fromInput(times[m.userId].out),
          backAt: times[m.userId].back ? fromInput(times[m.userId].back) : null,
        })),
      addMembers: added.map((a) => ({
        userId: a.userId,
        outAt: fromInput(times[a.userId].out),
        backAt: times[a.userId].back ? fromInput(times[a.userId].back) : null,
      })),
      removeUserIds: Array.from(removed),
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error || "บันทึกไม่สำเร็จ");
      return;
    }
    setEditing(false);
    setRemoved(new Set());
    setAdded([]);
    router.refresh();
  };

  const cancel = () => {
    setPlace(location);
    setTimes(initialTimes(members));
    setRemoved(new Set());
    setAdded([]);
    setPick("");
    setError(null);
    setEditing(false);
  };

  const timeInputs = (userId: string, name: string) => (
    <span className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
      <input
        type="datetime-local"
        value={times[userId]?.out ?? ""}
        onChange={(e) => setTime(userId, "out", e.target.value)}
        className={inputClass}
        aria-label={`เวลาออก ${name}`}
      />
      →
      <input
        type="datetime-local"
        value={times[userId]?.back ?? ""}
        onChange={(e) => setTime(userId, "back", e.target.value)}
        className={inputClass}
        aria-label={`เวลากลับ ${name}`}
      />
    </span>
  );

  return (
    <>
      <div className="px-6 py-4 flex items-center justify-between gap-3">
        {editing ? (
          <label className="flex items-center gap-2 flex-1 min-w-0">
            <MapPin className="w-4 h-4 text-orange-500 shrink-0" />
            <input value={place} onChange={(e) => setPlace(e.target.value)} className={`${inputClass} flex-1 min-w-0 font-semibold`} placeholder="สถานที่" />
          </label>
        ) : (
          <p className="text-sm text-gray-700">
            สถานที่: <span className="font-semibold text-gray-900">{location}</span>
          </p>
        )}
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            <Pencil className="w-3.5 h-3.5" />
            แก้ไข
          </button>
        )}
      </div>

      <div className="px-6 py-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">ผู้ปฏิบัติงาน</p>
        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-md overflow-hidden">
          {members.map((m) => {
            const isRemoved = removed.has(m.userId);
            return (
              <li key={m.userId} className={`px-3 py-2 bg-white flex flex-wrap items-center justify-between gap-2 ${isRemoved ? "opacity-50" : ""}`}>
                <Link href={`/users/${m.userId}`} className={`text-sm text-gray-900 hover:text-orange-600 font-medium ${isRemoved ? "line-through" : ""}`}>
                  {m.name}
                </Link>
                {editing ? (
                  <span className="flex items-center gap-1.5">
                    {isRemoved ? <span className="text-xs text-red-600">จะถูกเอาออกจากทริป</span> : timeInputs(m.userId, m.name)}
                    <button
                      type="button"
                      onClick={() => toggleRemoved(m.userId)}
                      className="text-xs font-semibold text-gray-500 hover:text-red-600 inline-flex items-center gap-0.5"
                      aria-label={isRemoved ? `ยกเลิกการเอา ${m.name} ออก` : `เอา ${m.name} ออกจากทริป`}
                    >
                      {isRemoved ? "เลิกลบ" : <X className="w-4 h-4" />}
                    </button>
                  </span>
                ) : (
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-gray-400" />
                    {formatThaiTime(m.outAt)}
                    {" → "}
                    {m.backAt ? formatThaiTime(m.backAt) : <span className="text-green-600 font-semibold">ยังไม่กลับ</span>}
                  </span>
                )}
              </li>
            );
          })}
          {editing &&
            added.map((a) => (
              <li key={a.userId} className="px-3 py-2 bg-orange-50/50 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-gray-900 font-medium">
                  {a.name} <span className="text-[11px] font-semibold text-orange-600">(เพิ่มใหม่)</span>
                </span>
                <span className="flex items-center gap-1.5">
                  {timeInputs(a.userId, a.name)}
                  <button type="button" onClick={() => dropAdded(a.userId)} className="text-gray-500 hover:text-red-600" aria-label={`ไม่เพิ่ม ${a.name}`}>
                    <X className="w-4 h-4" />
                  </button>
                </span>
              </li>
            ))}
        </ul>

        {editing && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <select value={pick} onChange={(e) => setPick(e.target.value)} className={`${inputClass} min-w-[10rem]`} aria-label="เลือกคนที่จะเพิ่มในทริป">
              <option value="">+ เพิ่มคนในทริป...</option>
              {pickable.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addPerson}
              disabled={!pick}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-orange-200 bg-orange-50 text-orange-700 text-sm font-semibold hover:bg-orange-100 disabled:opacity-40"
            >
              <Plus className="w-4 h-4" />
              เพิ่ม
            </button>
          </div>
        )}

        {editing && (
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={save}
              disabled={saving || !place.trim()}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              className="px-3 py-1.5 rounded-md border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
            >
              ยกเลิก
            </button>
            <span className="text-xs text-gray-400">ใส่เวลากลับให้คนที่ยังไม่กลับได้ · การเอาคนออกจะลบรายการสแกนของทริปนี้ของเขาด้วย</span>
            {error && <span className="text-xs text-red-600 w-full">{error}</span>}
          </div>
        )}
      </div>
    </>
  );
}
