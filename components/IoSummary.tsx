"use client";

import { useEffect, useState } from "react";
import { CircleAlert, CircleCheck, CircleSlash } from "lucide-react";
import { getModuleSettings, type ModuleSettingsInfo } from "@/app/actions/modbusSettings";
import { COILS_PER_MODULE, MODULE_COUNT, channelAt, type ChannelMap, type ModuleStatus } from "@/lib/relayState";
import { channelAssignments } from "@/lib/zones";

/** One chip per module: answering / not answering / not set up. */
function StatusChip({ status }: { status: ModuleStatus | undefined }) {
  if (!status) return <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">กำลังโหลด…</span>;
  if (status.online) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
        <CircleCheck className="h-3.5 w-3.5" />
        ออนไลน์
      </span>
    );
  }
  if (!status.configured) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
        <CircleSlash className="h-3.5 w-3.5" />
        ยังไม่ตั้งค่า
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
      <CircleAlert className="h-3.5 w-3.5" />
      ไม่ตอบ
    </span>
  );
}

/**
 * The "สรุป IO" tab: for each I/O module its address and status, and what each
 * of its 16 outputs (address 0–15) is currently wired to. Read-only; the wiring
 * itself is changed from the channel list (pencil on each channel).
 */
export default function IoSummary({
  modules,
  channelMap,
  states,
  channelCount,
  canConfigure,
}: {
  modules: ModuleStatus[] | null;
  channelMap: ChannelMap | null;
  states: boolean[] | null;
  channelCount: number;
  /** Only ADMIN / OPERATOR may see the modules' network addresses. */
  canConfigure: boolean;
}) {
  const [settings, setSettings] = useState<ModuleSettingsInfo[] | null>(null);
  const [mode, setMode] = useState<"direct" | "agent">("direct");

  useEffect(() => {
    if (!canConfigure) return;
    let cancelled = false;
    getModuleSettings().then((result) => {
      if (cancelled || !result.success) return;
      setSettings(result.modules);
      setMode(result.mode);
    });
    return () => {
      cancelled = true;
    };
  }, [canConfigure, modules]);

  const assignments = channelAssignments(channelCount);

  const addressText = (m: number): string => {
    if (!canConfigure) return "";
    const info = settings?.[m];
    if (!info) return "";
    if (info.saved) return `${info.saved.host}:${info.saved.port} · Unit ${info.saved.unitId}`;
    if (info.effective?.host) return `${info.effective.host}:${info.effective.port} · Unit ${info.effective.unitId} (${info.effective.source === "env" ? "env" : "ค่าเริ่มต้น"})`;
    return mode === "agent" ? "ใช้ค่าจาก .env บน Pi" : "ยังไม่ตั้ง IP";
  };

  if (!channelMap) return <p className="text-sm text-gray-500">กำลังโหลด…</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {Array.from({ length: MODULE_COUNT }, (_, m) => {
        const status = modules?.[m];
        const wired = Array.from({ length: COILS_PER_MODULE }, (_, a) => channelAt(channelMap, m, a)).filter((c) => c >= 0);
        const onCount = wired.filter((c) => states?.[c]).length;
        const text = addressText(m);
        return (
          <section key={m} className="rounded-xl border border-gray-200 bg-white">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">IO ตัวที่ {m + 1}</h3>
                {text && <p className="text-xs text-gray-500">{text}</p>}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">เปิดอยู่ {status?.online ? onCount : "—"} / {wired.length}</span>
                <StatusChip status={status} />
              </div>
            </header>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500">
                  <th className="px-4 py-2 font-medium">Address</th>
                  <th className="px-2 py-2 font-medium">ช่อง</th>
                  <th className="px-2 py-2 font-medium">ไฟ / โซน</th>
                  <th className="px-4 py-2 text-right font-medium">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: COILS_PER_MODULE }, (_, a) => {
                  const ch = channelAt(channelMap, m, a);
                  const assignment = ch >= 0 ? assignments[ch] : null;
                  const on = ch >= 0 ? (states?.[ch] ?? false) : false;
                  return (
                    <tr key={a} className="border-t border-gray-100">
                      <td className="px-4 py-1.5 font-mono text-gray-600">{a}</td>
                      <td className="px-2 py-1.5 text-gray-700">{ch >= 0 ? `CH${ch + 1}` : "—"}</td>
                      <td className={`px-2 py-1.5 ${assignment?.zone ? "text-gray-800" : "italic text-gray-400"}`}>
                        {assignment ? assignment.name : "ไม่ได้ต่อ"}
                      </td>
                      <td className="px-4 py-1.5 text-right">
                        {status?.online ? (
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${on ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                            {on ? "ON" : "OFF"}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
