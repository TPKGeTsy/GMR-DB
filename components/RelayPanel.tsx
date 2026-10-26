"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Info, Pencil, Power, RefreshCw, RotateCcw, Settings2, WifiOff } from "lucide-react";
import { getRelayStates, restoreRelays, setRelay, type RelayResult } from "@/app/actions/modbus";
import { FLOOR_MAPS, channelAssignments } from "@/lib/zones";
import {
  COILS_PER_MODULE,
  MODULE_COUNT,
  channelAt,
  describeModuleStatus,
  moduleOfChannel,
  restorableMismatches,
  type ChannelMap,
  type ModuleStatus,
  type SavedStates,
} from "@/lib/relayState";
import ZoneMap from "./ZoneMap";
import ModuleSettingsPanel from "./ModuleSettingsPanel";
import ModuleAddressEditor from "./ModuleAddressEditor";
import PersonIcon from "./PersonIcon";
import IoSummary from "./IoSummary";
import SchedulePanel from "./SchedulePanel";
import ChannelWiringDialog from "./ChannelWiringDialog";

const POLL_MS = 5000;
const CHANNELS_TAB = "channels";
const IO_TAB = "io";

// "2 hours", "3 days"... for how long the Pi has been silent.
function quietFor(seconds: number): string {
  if (seconds < 120) return `${seconds} วินาที`;
  if (seconds < 7200) return `${Math.round(seconds / 60)} นาที`;
  if (seconds < 172800) return `${Math.round(seconds / 3600)} ชั่วโมง`;
  return `${Math.round(seconds / 86400)} วัน`;
}
const SCHEDULE_TAB = "schedule";

export default function RelayPanel({
  channelCount,
  canConfigure = false,
}: {
  channelCount: number;
  /** Show the module address settings (ADMIN / OPERATOR only). */
  canConfigure?: boolean;
}) {
  const [states, setStates] = useState<boolean[] | null>(null);
  const [saved, setSaved] = useState<SavedStates | null>(null);
  const [modules, setModules] = useState<ModuleStatus[] | null>(null);
  const [channelMap, setWiring] = useState<ChannelMap | null>(null); // which module/address each channel drives
  const [mode, setMode] = useState<"agent" | "direct" | null>(null); // how the web app reaches the modules
  const [agentReportedAt, setAgentReportedAt] = useState<string | null>(null); // when the Pi last reported
  const [clock, setClock] = useState(() => Date.now()); // ticks so "N seconds ago" stays current
  const [editingChannel, setEditingChannel] = useState<number | null>(null);
  const [wiringNote, setWiringNote] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null); // why nothing is live (shown when no module answers)
  const [busy, setBusy] = useState<number | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<string>(FLOOR_MAPS[0].id);

  const apply = useCallback((result: RelayResult) => {
    if (result.success) {
      setStates(result.states);
      setSaved(result.saved);
      setModules(result.modules);
      setWiring(result.channelMap);
      if (result.mode) setMode(result.mode);
      if (result.agentReportedAt !== undefined) setAgentReportedAt(result.agentReportedAt);
      setNotice(result.modules.some((m) => m.online) ? null : (result.error ?? null));
      setError(null);
    } else {
      setError(result.error);
    }
  }, []);

  // While a switch is in flight the page already shows the new state; a
  // background refresh landing now would read the old one and flip it back.
  const switching = useRef(false);

  const refresh = useCallback(async () => {
    const result = await getRelayStates();
    if (!switching.current) apply(result);
  }, [apply]);

  useEffect(() => {
    // Initial load plus a light poll so the page follows changes made from
    // elsewhere (the other site, or someone else's browser).
    const first = setTimeout(refresh, 0);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [refresh]);

  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const moduleOnline = (channel: number) => !!modules?.[moduleOfChannel(channel, channelMap ?? undefined)]?.online;
  const anyOnline = !!modules?.some((m) => m.online);

  const toggle = async (index: number) => {
    if (!states || busy !== null || !moduleOnline(index)) return;
    const before = states;
    const turnOn = !before[index];
    switching.current = true;
    setBusy(index);
    // Optimistic: show the new state the instant it is pressed; the answer
    // from the Pi (normally well under a second) confirms it, and a failure
    // puts the old state back with the error.
    setStates(before.map((v, i) => (i === index ? turnOn : v)));
    const result = await setRelay(index, turnOn);
    if (!result.success) setStates(before);
    apply(result);
    switching.current = false;
    setBusy(null);
  };

  const mismatches = states && saved && modules ? restorableMismatches(states, modules, saved, channelMap ?? undefined) : [];

  const restore = async () => {
    if (restoring || !anyOnline) return;
    const list = mismatches.map((i) => `ช่อง ${i + 1} → ${saved?.[i] ? "ON" : "OFF"}`).join(", ");
    if (!window.confirm(`กู้คืนสถานะที่บันทึกไว้?\n${list}`)) return;
    setRestoring(true);
    apply(await restoreRelays());
    setRestoring(false);
  };

  const activeMap = FLOOR_MAPS.find((m) => m.id === tab);

  // One note per module that isn't available, saying how many channels it covers.
  const moduleNotes = (modules ?? []).flatMap((status, m) => {
    const reason = describeModuleStatus(m, status);
    if (!reason) return [];
    const covered = channelMap ? channelMap.filter((l) => l.module === m).length : COILS_PER_MODULE;
    return [{ m, installed: status.configured, text: `${reason} — ${covered} ช่องของโมดูลนี้ใช้งานไม่ได้${status.configured ? " (แสดงสถานะที่บันทึกไว้)" : ""}` }];
  });

  return (
    <div>
      {modules && !anyOnline && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <WifiOff className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <p className="font-medium">กำลังแสดงสถานะที่บันทึกไว้ล่าสุด (ไม่ใช่สถานะจริง)</p>
            <p>{notice ?? "เชื่อมต่อโมดูล I/O ไม่ได้"} ปุ่มสั่งงานถูกปิดไว้จนกว่าจะต่อโมดูลได้</p>
          </div>
        </div>
      )}

      {anyOnline &&
        moduleNotes.map((note) => (
          <div
            key={note.m}
            className={`mb-3 flex items-start gap-2 rounded-md border px-4 py-2.5 text-sm ${
              note.installed
                ? "border-amber-300 bg-amber-50 text-amber-800"
                : "border-gray-200 bg-gray-50 text-gray-600"
            }`}
          >
            {note.installed ? <WifiOff className="mt-0.5 h-4 w-4 flex-shrink-0" /> : <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />}
            <p>{note.text}</p>
          </div>
        ))}

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {mismatches.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <p>
            สถานะจริงของโมดูลไม่ตรงกับที่บันทึกไว้ {mismatches.length} ช่อง (
            {mismatches.map((i) => `CH${i + 1}`).join(", ")}) เช่นหลังไฟดับหรือโมดูลรีเซ็ต
          </p>
          <button
            type="button"
            onClick={restore}
            disabled={restoring}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            <RotateCcw className={`h-4 w-4 ${restoring ? "animate-spin" : ""}`} />
            กู้คืนตามที่บันทึก
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 text-sm">
          {[...FLOOR_MAPS.map((m) => ({ id: m.id, title: m.title })), { id: CHANNELS_TAB, title: "รายช่อง" }, { id: IO_TAB, title: "สรุป IO" }, { id: SCHEDULE_TAB, title: "ตั้งเวลา" }].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                tab === t.id ? "bg-orange-500 text-white" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {t.title}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm text-gray-500">
            {states
              ? `${anyOnline ? "" : "บันทึกไว้: "}เปิดอยู่ ${states.filter(Boolean).length} / ${channelCount} ช่อง`
              : "กำลังโหลดสถานะ..."}
          </p>
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            รีเฟรช
          </button>
        </div>
      </div>

      {mode && (
        <p className="mb-3 flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
          {mode === "agent" ? (
            (() => {
              const age = agentReportedAt ? Math.max(0, Math.round((clock - new Date(agentReportedAt).getTime()) / 1000)) : null;
              const fresh = age !== null && age <= 10;
              return (
                <>
                  <span className={`inline-block h-2 w-2 rounded-full ${fresh ? "bg-green-500" : "bg-amber-500"}`} />
                  <span>
                    โหมด: ผ่าน Raspberry Pi ·{" "}
                    {age === null
                      ? "ยังไม่เคยได้รับรายงานจาก Pi"
                      : fresh
                        ? `Pi รายงานล่าสุด ${age} วินาทีที่แล้ว`
                        : `Pi เงียบมา ${quietFor(age)} (ยังไม่ได้รับรายงานใหม่)`}
                  </span>
                </>
              );
            })()
          ) : (
            <>
              <span className="inline-block h-2 w-2 rounded-full bg-gray-400" />
              <span>โหมด: เว็บเซิร์ฟเวอร์ต่อโมดูลโดยตรง (ไม่ผ่าน Pi)</span>
            </>
          )}
        </p>
      )}

      {wiringNote && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-md border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-900">
          <p>{wiringNote}</p>
          <button type="button" onClick={() => setWiringNote(null)} className="text-blue-700 hover:underline">
            ปิด
          </button>
        </div>
      )}

      {activeMap ? (
        <ZoneMap map={activeMap} states={states} busyChannel={busy} onToggle={toggle} modules={modules} channelMap={channelMap} />
      ) : tab === SCHEDULE_TAB ? (
        <SchedulePanel channelCount={channelCount} canConfigure={canConfigure} />
      ) : tab === IO_TAB ? (
        <IoSummary modules={modules} channelMap={channelMap} states={states} channelCount={channelCount} canConfigure={canConfigure} />
      ) : (
        <div className="space-y-6">
          {Array.from({ length: MODULE_COUNT }, (_, m) => {
            const status = modules?.[m];
            return (
              <section key={m}>
                <h2 className="mb-2 text-sm font-semibold text-gray-700">
                  IO ตัวที่ {m + 1} (address 0–{COILS_PER_MODULE - 1})
                  {status && !status.online && (
                    <span className="ml-2 text-xs font-normal text-gray-500">
                      {status.configured ? "ไม่ตอบ" : "ยังไม่ได้ตั้งค่า"}
                    </span>
                  )}
                </h2>
                {canConfigure ? (
                  <InlineIpEditor
                    key={status && !status.configured ? "not-installed" : "installed"}
                    moduleIndex={m}
                    status={status}
                    defaultOpen={!!status && !status.configured}
                    onChanged={refresh}
                  />
                ) : (
                  status &&
                  !status.configured && (
                    <p className="mb-3 text-xs text-gray-500">ยังไม่ได้ตั้ง IP ของโมดูลนี้ — ให้ ADMIN หรือ OPERATOR ตั้งที่หน้านี้</p>
                  )
                )}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {Array.from({ length: COILS_PER_MODULE }, (_, address) => {
                    const i = channelMap ? channelAt(channelMap, m, address) : m * COILS_PER_MODULE + address;
                    const { zone, name } = channelAssignments(channelCount)[i] ?? { zone: null, name: "—" };
                    const on = states?.[i] ?? false;
                    const unavailable = !!modules && !moduleOnline(i);
                    const disabled = !states || busy !== null || unavailable;
                    const spare = zone === null;
                    return (
                      <div key={address} className="relative">
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => toggle(i)}
                          aria-pressed={on}
                          className={`flex w-full flex-col items-center gap-1.5 rounded-xl border-2 px-4 py-5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                            on
                              ? "border-green-500 bg-green-500 text-white shadow"
                              : spare
                                ? "border-dashed border-gray-300 bg-gray-50 text-gray-400 hover:border-orange-400"
                                : "border-gray-200 bg-white text-gray-700 hover:border-orange-400"
                          }`}
                        >
                          {zone?.icon ? (
                            <PersonIcon kind={zone.icon} className={`h-8 w-6 ${busy === i ? "animate-pulse" : ""}`} />
                          ) : (
                            <Power className={`h-6 w-6 ${busy === i ? "animate-pulse" : ""}`} />
                          )}
                          <span>ช่อง {i + 1}</span>
                          <span className={`text-sm ${spare && !on ? "italic" : ""}`}>{name}</span>
                          <span className="text-xs font-normal opacity-80">
                            {!states ? "—" : on ? "ON" : "OFF"} · addr {address}
                          </span>
                        </button>
                        {canConfigure && channelMap && (
                          <button
                            type="button"
                            onClick={() => setEditingChannel(i)}
                            className={`absolute right-1.5 top-1.5 rounded-md p-1 ${on ? "text-white/80 hover:bg-white/20" : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"}`}
                            aria-label={`ตั้งที่อยู่ของช่อง ${i + 1}`}
                            title="ตั้ง IO / address ของช่องนี้"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {editingChannel !== null && channelMap && (
        <ChannelWiringDialog
          channel={editingChannel}
          channelMap={channelMap}
          channelCount={channelCount}
          onClose={() => setEditingChannel(null)}
          onSaved={(map, message) => {
            setWiring(map);
            setWiringNote(message);
            setEditingChannel(null);
            refresh();
          }}
        />
      )}

      {canConfigure && <ModuleSettingsPanel modules={modules} onChanged={refresh} />}
    </div>
  );
}

// A collapsible IP form under a module's heading in the channel list; opens by
// itself for a module that has no address yet.
function InlineIpEditor({
  moduleIndex,
  status,
  defaultOpen,
  onChanged,
}: {
  moduleIndex: number;
  status: ModuleStatus | undefined;
  defaultOpen: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      className="mb-3 rounded-lg border border-gray-200 bg-white"
    >
      <summary className="flex cursor-pointer select-none items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600">
        <Settings2 className="h-3.5 w-3.5 text-orange-500" />
        ตั้งค่า IP ของโมดูล {moduleIndex + 1}
      </summary>
      {open && (
        <div className="border-t border-gray-100 px-3 py-3">
          <ModuleAddressEditor moduleIndex={moduleIndex} status={status} onChanged={onChanged} showHeader={false} />
        </div>
      )}
    </details>
  );
}
