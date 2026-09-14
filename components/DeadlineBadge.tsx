import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { getDeadlineStatus, DeadlineTone } from "@/lib/projects";
import { formatThaiDate } from "@/lib/datetime";

const toneClass: Record<DeadlineTone, string> = {
  done: "bg-blue-50 text-blue-700 border-blue-200",
  overdue: "bg-red-50 text-red-700 border-red-200",
  urgent: "bg-red-50 text-red-700 border-red-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  ok: "bg-gray-50 text-gray-600 border-gray-200",
};

const toneIcon: Record<DeadlineTone, typeof AlertTriangle> = {
  done: CheckCircle2,
  overdue: AlertTriangle,
  urgent: AlertTriangle,
  warning: Clock,
  ok: Clock,
};

export default function DeadlineBadge({
  endDate,
  status,
  className = "",
}: {
  endDate: string | Date | null;
  status: string;
  className?: string;
}) {
  const deadline = getDeadlineStatus(endDate, status);
  if (!deadline) return null;

  const Icon = toneIcon[deadline.tone];

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-bold ${toneClass[deadline.tone]} ${className}`}
      title={`กำหนดส่งงาน: ${formatThaiDate(endDate as string | Date)}`}
    >
      <Icon className="w-3 h-3" />
      {deadline.label}
    </span>
  );
}
