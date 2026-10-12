"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Clock, MapPin, Pencil } from "lucide-react";
import { updateOutsideTripDetails } from "@/app/actions/outsideTripEdit";
import { bangkokDateKey, bangkokTimeHHMM, formatThaiTime } from "@/lib/datetime";

interface Member {
  userId: string;
  name: string;
  outAt: string;
  backAt: string | null;
}

// datetime-local works in "wall clock" terms — always Bangkok here (the
// whole app is), so convert both ways with the fixed +07:00 offset.
const toInput = (iso: string) => `${bangkokDateKey(new Date(iso))}T${bangkokTimeHHMM(iso)}`;
const fromInput = (v: string) => new Date(`${v}:00+07:00`).toISOString();

const initialTimes = (members: Member[]) =>
  Object.fromEntries(members.map((m) => [m.userId, { out: toInput(m.outAt), back: m.backAt ? toInput(m.backAt) : "" }]));

const inputClass = "rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none";

/** The trip's place name + members' leave/return times: shown as before,
 *  switchable into edit mode (the page itself is admin-only). */
export default function TripDetailsEditor({ tripId, location, members }: { tripId: string; location: string; members: Member[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [place, setPlace] = useState(location);
  const [times, setTimes] = useState(() => initialTimes(members));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    const result = await updateOutsideTripDetails(tripId, {
      location: place,
      members: members.map((m) => ({
        userId: m.userId,
        outAt: fromInput(times[m.userId].out),
        backAt: times[m.userId].back ? fromInput(times[m.userId].back) : null,
      })),
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error || "บันทึกไม่สำเร็จ");
      return;
    }
    setEditing(false);
    router.refresh();
  };

  const cancel = () => {
    setPlace(location);
    setTimes(initialTimes(members));
    setError(null);
    setEditing(false);
  };

  const setTime = (userId: string, key: "out" | "back", value: string) =>
    setTimes((t) => ({ ...t, [userId]: { ...t[userId], [key]: value } }));

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
          {members.map((m) => (
            <li key={m.userId} className="px-3 py-2 bg-white flex flex-wrap items-center justify-between gap-2">
              <Link href={`/users/${m.userId}`} className="text-sm text-gray-900 hover:text-orange-600 font-medium">
                {m.name}
              </Link>
              {editing ? (
                <span className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                  <input
                    type="datetime-local"
                    value={times[m.userId].out}
                    onChange={(e) => setTime(m.userId, "out", e.target.value)}
                    className={inputClass}
                    aria-label={`เวลาออก ${m.name}`}
                  />
                  →
                  <input
                    type="datetime-local"
                    value={times[m.userId].back}
                    onChange={(e) => setTime(m.userId, "back", e.target.value)}
                    className={inputClass}
                    aria-label={`เวลากลับ ${m.name}`}
                  />
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
          ))}
        </ul>
        {editing && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
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
            <span className="text-xs text-gray-400">คนที่ยังไม่กลับ ใส่เวลากลับเพื่อบันทึกการกลับได้</span>
            {error && <span className="text-xs text-red-600 w-full">{error}</span>}
          </div>
        )}
      </div>
    </>
  );
}
