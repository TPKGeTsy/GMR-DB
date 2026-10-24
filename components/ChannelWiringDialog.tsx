"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { setChannelWiring } from "@/app/actions/modbusSettings";
import { COILS_PER_MODULE, MODULE_COUNT, channelAt, type ChannelMap } from "@/lib/relayState";
import { channelAssignments } from "@/lib/zones";

const selectClass =
  "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";

/**
 * "Which output is this channel wired to?" — pick the I/O module and the coil
 * address (0–15). If another channel already uses that output the two simply
 * trade places (shown before saving), so no two channels can ever share one.
 */
export default function ChannelWiringDialog({
  channel,
  channelMap,
  channelCount,
  onClose,
  onSaved,
}: {
  /** 0-based channel being edited. */
  channel: number;
  channelMap: ChannelMap;
  channelCount: number;
  onClose: () => void;
  /** Called with the new map and a note (when another channel traded places). */
  onSaved: (map: ChannelMap, message: string | null) => void;
}) {
  const names = channelAssignments(channelCount);
  const current = channelMap[channel];
  const [module, setModule] = useState(current?.module ?? 0);
  const [address, setAddress] = useState(current?.address ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const occupant = channelAt(channelMap, module, address);
  const unchanged = occupant === channel;

  const save = async () => {
    setSaving(true);
    setError(null);
    const result = await setChannelWiring(channel, module, address);
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onSaved(result.channelMap, result.message ?? null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" aria-label={`ตั้งที่อยู่ของช่อง ${channel + 1}`}>
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              ช่อง {channel + 1} · {names[channel]?.name}
            </h3>
            <p className="text-xs text-gray-500">เลือกว่าช่องนี้ควบคุมเอาต์พุตตัวไหนของ IO</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="ปิด">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium text-gray-700">
            IO (โมดูล)
            <select value={module} onChange={(e) => setModule(Number(e.target.value))} className={selectClass}>
              {Array.from({ length: MODULE_COUNT }, (_, m) => (
                <option key={m} value={m}>
                  ตัวที่ {m + 1}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Address (0–{COILS_PER_MODULE - 1})
            <select value={address} onChange={(e) => setAddress(Number(e.target.value))} className={selectClass}>
              {Array.from({ length: COILS_PER_MODULE }, (_, a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
        </div>

        {!unchanged && occupant >= 0 && (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            ที่อยู่นี้ใช้โดย <b>ช่อง {occupant + 1} ({names[occupant]?.name})</b> อยู่ — เมื่อบันทึก สองช่องจะ <b>สลับที่กัน</b> (ช่อง {occupant + 1} จะไปใช้ที่อยู่เดิมของช่อง {channel + 1})
          </p>
        )}
        <p className="mt-3 text-xs text-gray-500">
          ระบบจะสั่งตามการต่อสายใหม่ทันที ควรปิดไฟของทั้งสองช่องนี้ก่อนเปลี่ยน
        </p>

        {error && <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || unchanged}
            className="rounded-md bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {saving ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
      </div>
    </div>
  );
}
