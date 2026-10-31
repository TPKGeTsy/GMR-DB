"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Recycle } from "lucide-react";
import { reserveOffcuts, storeLeftovers, type LeftoverInput } from "@/app/actions/steelOffcuts";
import { formatLengthWithUnit, type Unit } from "@/lib/units";
import { profileKey, profileLabelUnits, type CuttingPlan, type SteelProfile } from "@/lib/steel";

export interface OffcutRow {
  id: string;
  steelType: string;
  sectionX: number;
  sectionY: number | null;
  thickness: number | null;
  length: number;
  sourceName: string | null;
  /** The plan that has taken it (null = free for anybody). */
  reservedPlanId: string | null;
}

const MIN_KEEP_MM = 300;

/** The offcut library inside a plan: take offcuts that fit the steel of this plan (they are cut first, before new bars
 *  are bought) and, when the job is done, store what is left of the bars for the next plan. */
export default function SteelOffcutPanel({
  planId,
  canEdit,
  offcuts,
  result,
  profiles,
  unit,
  onChanged,
}: {
  planId: string;
  canEdit: boolean;
  offcuts: OffcutRow[];
  result: CuttingPlan;
  /** The steel kinds of this plan, by profile key. */
  profiles: Map<string, SteelProfile>;
  unit: Unit;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [minKeep, setMinKeep] = useState(String(MIN_KEEP_MM));
  const [confirming, setConfirming] = useState(false);

  const matching = useMemo(
    () => offcuts.filter((o) => profiles.has(profileKey(o))).sort((a, b) => profileKey(a).localeCompare(profileKey(b)) || b.length - a.length),
    [offcuts, profiles]
  );
  const free = matching.filter((o) => o.reservedPlanId === null);

  // The taken offcuts the plan really cut from (the plan knows which stock bar each cut came from).
  const consumedIds = useMemo(
    () => result.profiles.flatMap((p) => p.bars.flatMap((b) => (b.source === "stock" && b.stockId ? [b.stockId] : []))),
    [result]
  );

  const keep = Math.max(0, Number(minKeep) || 0);
  const leftovers = useMemo(() => {
    const out: LeftoverInput[] = [];
    for (const p of result.profiles) {
      const profile = profiles.get(p.key);
      if (!profile) continue;
      for (const b of p.bars) {
        if (b.leftover >= Math.max(1, keep)) {
          out.push({ steelType: profile.steelType, sectionX: profile.sectionX, sectionY: profile.sectionY, thickness: profile.thickness ?? null, length: b.leftover });
        }
      }
    }
    return out;
  }, [result, profiles, keep]);

  const run = async (job: () => Promise<{ success: boolean; error?: string }>, okMessage: string) => {
    setBusy(true);
    setMessage(null);
    const res = await job();
    setBusy(false);
    setMessage(res.success ? okMessage : (res.error ?? "ไม่สำเร็จ"));
    if (res.success) onChanged();
  };

  if (matching.length === 0 && leftovers.length === 0) return null;

  return (
    <section className="rounded-lg border border-gray-100 bg-white p-4 shadow print:hidden">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-gray-500">
          <Recycle className="h-4 w-4 text-orange-600" />
          เศษเหล็กในคลัง (ใช้ก่อนซื้อใหม่)
        </h2>
        <Link href="/steel-cutting/offcuts" className="rounded-full border border-orange-200 px-3 py-1 text-xs text-orange-700 hover:bg-orange-50">
          ดูคลังเศษทั้งหมด →
        </Link>
      </div>

      {matching.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs text-gray-500">
            เศษที่เป็นเหล็กชนิดเดียวกับแผนนี้ {matching.length} ชิ้น — ติ๊กเลือกแล้วแผนตัดจะใช้เศษพวกนี้ก่อน (ถ้าตัดชิ้นไหนได้) ที่ติ๊กไว้ ใช้ไป {consumedIds.length} ชิ้น
          </p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {matching.map((o) => {
              const taken = o.reservedPlanId === planId;
              return (
                <li key={o.id}>
                  <label className="flex items-center gap-2 rounded border border-gray-100 px-2 py-1 text-sm">
                    <input
                      type="checkbox"
                      checked={taken}
                      disabled={!canEdit || busy || (o.reservedPlanId !== null && !taken)}
                      onChange={(e) => run(() => reserveOffcuts(planId, [o.id], e.target.checked), "")}
                    />
                    <span className="font-medium">{formatLengthWithUnit(o.length, unit)}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-gray-500">
                      {profileLabelUnits(o, unit)}
                      {o.sourceName ? ` · จาก ${o.sourceName}` : ""}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {canEdit && free.length > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => reserveOffcuts(planId, free.map((o) => o.id), true), "")}
              className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
            >
              ใช้ทุกชิ้นที่ตรงกับแผนนี้
            </button>
          )}
        </div>
      ) : (
        <p className="text-xs text-gray-400">ยังไม่มีเศษในคลังที่เป็นเหล็กชนิดเดียวกับแผนนี้</p>
      )}

      {canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3 text-sm text-gray-700">
          <span>จบงานแล้ว เก็บเศษที่ยาวตั้งแต่</span>
          <input
            type="number"
            min={1}
            value={minKeep}
            onChange={(e) => setMinKeep(e.target.value)}
            className="w-20 rounded border border-gray-300 px-2 py-1 text-right text-sm"
            aria-label="ความยาวเศษขั้นต่ำที่เก็บ (มม.)"
          />
          <span>มม. ({leftovers.length} ชิ้น)</span>
          {!confirming ? (
            <button
              type="button"
              disabled={busy || leftovers.length === 0}
              onClick={() => setConfirming(true)}
              className="rounded border border-orange-300 bg-orange-50 px-3 py-1 text-sm font-medium text-orange-700 hover:bg-orange-100 disabled:opacity-50"
            >
              เก็บเศษเข้าคลัง
            </button>
          ) : (
            <span className="flex flex-wrap items-center gap-2 rounded border border-orange-300 bg-orange-50 px-2 py-1">
              <span className="text-xs text-orange-800">
                เก็บเข้าคลัง {leftovers.length} ชิ้น · เอาเศษที่ใช้ไป {consumedIds.length} ชิ้นออกจากคลัง (เก็บซ้ำได้ ระบบแทนที่ของเดิมของแผนนี้)
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setConfirming(false);
                  run(() => storeLeftovers(planId, { consumedIds, leftovers }), `เก็บเศษเข้าคลังแล้ว ${leftovers.length} ชิ้น`);
                }}
                className="rounded bg-orange-600 px-3 py-1 text-sm font-medium text-white hover:bg-orange-700"
              >
                ยืนยัน
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="text-sm text-gray-600 hover:underline">
                ยกเลิก
              </button>
            </span>
          )}
        </div>
      )}
      {message && <p className="mt-2 text-xs text-gray-600">{message}</p>}
    </section>
  );
}
