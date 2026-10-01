export const LEAVE_TYPES = ["SICK", "PERSONAL", "VACATION"] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const leaveTypeLabel: Record<string, string> = { SICK: "ลาป่วย", PERSONAL: "ลากิจ", VACATION: "ลาพักร้อน" };
