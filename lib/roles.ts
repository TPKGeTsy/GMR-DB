// Roles allowed to grant OT directly and to approve OtApprovalRequest rows
// (operator LINE-button grants, self-serve OT requests, outside-work-trip
// auto-requests). Leave/booking approvals stay ADMIN/OPERATOR-only — SENIOR
// is scoped to OT matters only, per how the role was introduced.
export const OT_MANAGER_ROLES = ["ADMIN", "OPERATOR", "SENIOR"];

export function isOtManagerRole(role: string | undefined | null): boolean {
  return !!role && OT_MANAGER_ROLES.includes(role);
}
