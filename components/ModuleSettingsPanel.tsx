"use client";

import { useState } from "react";
import { Settings2 } from "lucide-react";
import { MODULE_COUNT, type ModuleStatus } from "@/lib/relayState";
import ModuleAddressEditor from "./ModuleAddressEditor";

/**
 * The collapsible "ตั้งค่าโมดูล (IP)" box at the bottom of /modbus: one address
 * form per module. (The same forms also appear inline in the channel list.)
 */
export default function ModuleSettingsPanel({
  modules,
  onChanged,
}: {
  /** Live status per module, to show next to each form. */
  modules: ModuleStatus[] | null;
  /** Called after a successful save/clear so the page can refresh its status. */
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <details
      className="mt-8 rounded-xl border border-gray-200 bg-white"
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-700">
        <Settings2 className="h-4 w-4 text-orange-500" />
        ตั้งค่าโมดูล (IP)
        <span className="ml-1 text-xs font-normal text-gray-400">เฉพาะ ADMIN / OPERATOR</span>
      </summary>

      {/* Mounted only while open, so the settings are fetched when first needed. */}
      {open && (
        <div className="space-y-5 border-t border-gray-100 px-4 py-4">
          {Array.from({ length: MODULE_COUNT }, (_, m) => (
            <section key={m} className="rounded-lg border border-gray-200 p-3">
              <ModuleAddressEditor moduleIndex={m} status={modules?.[m]} onChanged={onChanged} showHelp={m === 0} />
            </section>
          ))}
        </div>
      )}
    </details>
  );
}
