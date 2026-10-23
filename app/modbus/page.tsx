import { Power } from "lucide-react";
import RelayPanel from "@/components/RelayPanel";
import { auth } from "@/auth";
import { canManageUsers } from "@/lib/roles";
import { COIL_COUNT } from "@/lib/relayState";
import { describeAutoOff, parseAutoOffConfig } from "@/lib/autoOff";

export const dynamic = "force-dynamic";

// Login is enforced by auth.config.ts (every route except /login and
// /register requires a session). No role restriction on purpose.
export default async function ModbusPage() {
  const session = await auth();
  const autoOffNote = describeAutoOff(parseAutoOffConfig(process.env));

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <Power className="h-7 w-7 text-orange-500" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Modbus Output (ควบคุมเอาต์พุต)</h1>
          <p className="text-sm text-gray-500">กดที่โซนหรือช่องเพื่อสลับ เปิด/ปิด — เปิดแล้วจะค้างอยู่จนกว่าจะกดปิด</p>
          {autoOffNote && <p className="mt-0.5 text-sm text-amber-700">{autoOffNote}</p>}
        </div>
      </div>
      <RelayPanel channelCount={COIL_COUNT} canConfigure={canManageUsers(session?.user?.role)} />
    </div>
  );
}
