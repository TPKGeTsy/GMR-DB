// Roles allowed to grant OT directly and to approve OtApprovalRequest rows
// (operator LINE-button grants, self-serve OT requests, outside-work-trip
// auto-requests). Leave/booking approvals stay ADMIN/OPERATOR-only — SENIOR
// is scoped to OT matters only, per how the role was introduced.
export const OT_MANAGER_ROLES = ["ADMIN", "OPERATOR", "SENIOR"];

export function isOtManagerRole(role: string | undefined | null): boolean {
  return !!role && OT_MANAGER_ROLES.includes(role);
}

// Roles allowed into /users (employee management). OPERATOR gets the same
// access as ADMIN here EXCEPT changing a user's role (updateUserRole stays
// ADMIN-only) and seeing another employee's check-in/attendance history
// (gated separately, per-page, since it's not a role check but a "whose
// profile" check).
export const MANAGE_USERS_ROLES = ["ADMIN", "OPERATOR"];

export function canManageUsers(role: string | undefined | null): boolean {
  return !!role && MANAGE_USERS_ROLES.includes(role);
}

// The only account allowed to approve new self-registrations. Deliberately
// one specific person rather than every ADMIN — other admins shouldn't have
// to deal with approval requests.
export const OWNER_USERNAME = "Gamer";

export function isOwner(username: string | undefined | null): boolean {
  return username === OWNER_USERNAME;
}
