import { BadgeCheck, Clock } from "lucide-react";
import { paymentStatusOf } from "@/lib/laborHire";

const baht = (n: number) => `฿${n.toLocaleString("th-TH")}`;

/** Paid / partly paid / unpaid pill, derived from the amounts. Shared by the
 *  hire log and the consult history page (no hooks, so it works in both
 *  server and client components). */
export default function LaborPaymentBadge({ cost, paidAmount }: { cost: number; paidAmount: number }) {
  const status = paymentStatusOf(cost, paidAmount);
  if (status === "NONE") return null;
  const outstanding = cost - paidAmount;
  if (status === "PAID") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
        <BadgeCheck className="w-3 h-3" />
        จ่ายแล้ว
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
        status === "PARTIAL" ? "text-amber-700 bg-amber-50" : "text-red-700 bg-red-50"
      }`}
    >
      <Clock className="w-3 h-3" />
      {status === "PARTIAL" ? `จ่ายบางส่วน · ค้าง ${baht(outstanding)}` : `ค้างจ่าย ${baht(outstanding)}`}
    </span>
  );
}
