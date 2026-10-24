"use client";

import { useEffect, useState } from "react";
import { Save, Trash2 } from "lucide-react";
import {
  clearModuleSettings,
  getModuleSettings,
  saveModuleSettings,
  type ModuleSettingsInfo,
  type ModuleSettingsResult,
} from "@/app/actions/modbusSettings";
import { COILS_PER_MODULE, type ModuleStatus } from "@/lib/relayState";

interface FormState {
  host: string;
  port: string;
  unitId: string;
}

const SOURCE_LABEL: Record<string, string> = {
  page: "ตั้งจากหน้านี้",
  env: "จาก env บนเซิร์ฟเวอร์",
  default: "ค่าเริ่มต้น",
  none: "ยังไม่ตั้งค่า",
};

function toForm(info: ModuleSettingsInfo): FormState {
  // Show what's saved from this page; otherwise what the server currently uses
  // (so module 1's default address is visible), else blank.
  const src = info.saved ?? (info.effective?.host ? info.effective : null);
  return { host: src?.host ?? "", port: String(src?.port ?? 502), unitId: String(src?.unitId ?? 1) };
}

const inputClass =
  "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";

/**
 * IP / port / Unit ID form for ONE module. Loads its own settings when it
 * mounts, so render it only when it should be visible. Used both in the
 * "ตั้งค่าโมดูล (IP)" box at the bottom of /modbus and inline in the channel list.
 */
export default function ModuleAddressEditor({
  moduleIndex,
  status,
  onChanged,
  showHeader = true,
  showHelp = false,
}: {
  moduleIndex: number;
  /** Live status of this module, shown as a chip in the header. */
  status: ModuleStatus | undefined;
  /** Called after a successful save/clear so the page can refresh its status. */
  onChanged: () => void;
  showHeader?: boolean;
  /** Show the paragraph explaining what this address means. */
  showHelp?: boolean;
}) {
  const [mode, setMode] = useState<"direct" | "agent">("direct");
  const [info, setInfo] = useState<ModuleSettingsInfo | null>(null);
  const [form, setForm] = useState<FormState>({ host: "", port: "502", unitId: "1" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const accept = (result: ModuleSettingsResult): boolean => {
    if (!result.success) return false;
    const mine = result.modules.find((m) => m.moduleIndex === moduleIndex) ?? null;
    setMode(result.mode);
    setInfo(mine);
    if (mine) setForm(toForm(mine));
    return true;
  };

  useEffect(() => {
    let cancelled = false;
    getModuleSettings().then((result) => {
      if (cancelled) return;
      if (!accept(result)) setLoadError(result.success ? null : result.error);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  const run = async (action: () => Promise<ModuleSettingsResult>, doneText: string) => {
    setBusy(true);
    setMessage(null);
    const result = await action();
    if (accept(result)) {
      setMessage({ ok: true, text: doneText });
      onChanged();
    } else {
      setMessage({ ok: false, text: result.success ? "ไม่สำเร็จ" : result.error });
    }
    setBusy(false);
  };

  const n = moduleIndex + 1;

  if (loadError) return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>;
  if (!info) return <p className="text-sm text-gray-500">กำลังโหลด...</p>;

  return (
    <div>
      {showHelp && (
        <p className="mb-3 text-xs text-gray-500">
          ที่นี่คือที่อยู่ที่ <strong>ระบบใช้เรียกโมดูล</strong> ไม่ได้เปลี่ยนค่าในตัวโมดูล — ถ้าจะย้ายโมดูลไปวงเครือข่ายอื่น
          ต้องตั้ง IP ในหน้าตั้งค่าของโมดูลเองก่อน (แล้วกด 保存并重启) จากนั้นค่อยใส่ IP ใหม่ที่นี่
          {mode === "agent"
            ? " โปรแกรมบน Raspberry Pi จะดึงค่านี้จากเว็บเองภายในไม่กี่วินาที (ถ้าไม่ตั้ง Pi ใช้ค่าจาก .env บนตัว Pi)"
            : " ถ้าไม่ตั้ง จะใช้ค่าจาก env บนเซิร์ฟเวอร์"}
        </p>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {showHeader && (
          <h3 className="text-sm font-semibold text-gray-800">
            โมดูล {n} (address 0–{COILS_PER_MODULE - 1})
          </h3>
        )}
        {status && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              status.online
                ? "bg-green-100 text-green-700"
                : status.configured
                  ? "bg-amber-100 text-amber-800"
                  : "bg-gray-100 text-gray-600"
            }`}
          >
            {status.online ? "ออนไลน์" : status.configured ? "ไม่ตอบ" : "ยังไม่ตั้งค่า"}
          </span>
        )}
        <span className="text-xs text-gray-500">
          {info.effective
            ? `ใช้อยู่: ${info.effective.host ? `${info.effective.host}:${info.effective.port} (unit ${info.effective.unitId})` : "—"} · ${SOURCE_LABEL[info.effective.source]}`
            : info.saved
              ? `ตั้งจากหน้านี้: ${info.saved.host}:${info.saved.port} (unit ${info.saved.unitId})`
              : "ยังไม่ได้ตั้งจากหน้านี้"}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_7rem_6rem]">
        <label className="text-xs font-medium text-gray-600">
          IP
          <input
            value={form.host}
            onChange={(e) => setForm({ ...form, host: e.target.value })}
            placeholder="192.168.1.12"
            inputMode="decimal"
            className={inputClass}
          />
        </label>
        <label className="text-xs font-medium text-gray-600">
          พอร์ต
          <input
            value={form.port}
            onChange={(e) => setForm({ ...form, port: e.target.value })}
            inputMode="numeric"
            className={inputClass}
          />
        </label>
        <label className="text-xs font-medium text-gray-600">
          Unit ID
          <input
            value={form.unitId}
            onChange={(e) => setForm({ ...form, unitId: e.target.value })}
            inputMode="numeric"
            className={inputClass}
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => saveModuleSettings(moduleIndex, form), "บันทึกแล้ว")}
          className="inline-flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          บันทึก
        </button>
        {info.saved && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (window.confirm(`ล้างค่าที่ตั้งของโมดูล ${n}? ระบบจะกลับไปใช้ค่าจาก env`)) {
                void run(() => clearModuleSettings(moduleIndex), "ล้างค่าแล้ว");
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" />
            ล้างค่า
          </button>
        )}
        {message && <span className={`text-sm ${message.ok ? "text-green-700" : "text-red-600"}`}>{message.text}</span>}
      </div>
    </div>
  );
}
