export type DeadlineTone = "done" | "overdue" | "urgent" | "warning" | "ok";

export interface DeadlineStatus {
  label: string;
  tone: DeadlineTone;
  daysRemaining: number;
}

/** Computes a human-readable, color-coded status for a project's deadline (endDate). */
export function getDeadlineStatus(
  endDate: string | Date | null,
  status: string
): DeadlineStatus | null {
  if (!endDate) return null;

  const diffMs = new Date(endDate).getTime() - Date.now();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (status === "COMPLETED") {
    return { label: "เสร็จสิ้นแล้ว", tone: "done", daysRemaining };
  }
  if (daysRemaining < 0) {
    return { label: `เลยกำหนดมา ${Math.abs(daysRemaining)} วัน`, tone: "overdue", daysRemaining };
  }
  if (daysRemaining === 0) {
    return { label: "ครบกำหนดวันนี้", tone: "urgent", daysRemaining };
  }
  if (daysRemaining <= 7) {
    return { label: `เหลืออีก ${daysRemaining} วัน`, tone: "warning", daysRemaining };
  }
  return { label: `เหลืออีก ${daysRemaining} วัน`, tone: "ok", daysRemaining };
}
