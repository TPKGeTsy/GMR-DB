import prisma from "./prisma";
import { logError } from "./logger";
import { pushLineMessage, type QuickReplyOption } from "./line";
import { OT_MANAGER_ROLES } from "./roles";

export type ApprovalKind = "LEAVE" | "BOOKING";

/** Pushes a pending request to every admin/operator with a linked LINE
 *  account, with Quick Reply buttons whose hidden `text` payload (distinct
 *  from the visible `label`) encodes the decision + request id — so tapping
 *  one sends e.g. "APPROVE_LEAVE:cuid" back as an ordinary message, with no
 *  server-side "what are we talking about" state needed to route it. */
export async function notifyAdminsForApproval(kind: ApprovalKind, id: string, summary: string): Promise<void> {
  try {
    const approvers = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "OPERATOR"] }, lineUserId: { not: null } },
      select: { lineUserId: true },
    });

    const quickReplies: QuickReplyOption[] = [
      { label: "✅ อนุมัติ", text: `APPROVE_${kind}:${id}` },
      { label: "❌ ปฏิเสธ", text: `REJECT_${kind}:${id}` },
    ];

    await Promise.all(
      approvers.map((a) => pushLineMessage(a.lineUserId!, summary, quickReplies))
    );
  } catch (error) {
    logError("Failed to notify admins for approval", error, { kind, id });
  }
}

/** Same as notifyAdminsForApproval, but for OT-specific approval requests
 *  (OtApprovalRequest — self-serve OT requests and outside-work-trip
 *  auto-requests) — SENIOR should see these too, unlike leave/booking. */
export async function notifyOtManagers(id: string, summary: string): Promise<void> {
  try {
    const approvers = await prisma.user.findMany({
      where: { role: { in: OT_MANAGER_ROLES }, lineUserId: { not: null } },
      select: { lineUserId: true },
    });

    const quickReplies: QuickReplyOption[] = [
      { label: "✅ อนุมัติ", text: `APPROVE_OT_REQUEST:${id}` },
      { label: "❌ ปฏิเสธ", text: `REJECT_OT_REQUEST:${id}` },
    ];

    await Promise.all(approvers.map((a) => pushLineMessage(a.lineUserId!, summary, quickReplies)));
  } catch (error) {
    logError("Failed to notify OT managers", error, { id });
  }
}

/** Informational-only push to every linked admin/operator — no action
 *  needed, used for things that stay self-service (borrow/return) but that
 *  admins asked to be kept aware of. */
export async function notifyAdminsFYI(summary: string): Promise<void> {
  try {
    const approvers = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "OPERATOR"] }, lineUserId: { not: null } },
      select: { lineUserId: true },
    });

    await Promise.all(approvers.map((a) => pushLineMessage(a.lineUserId!, summary)));
  } catch (error) {
    logError("Failed to send admin FYI", error);
  }
}

/** Pushes a message to one specific user if they have LINE linked — used to
 *  tell someone their leave/booking request was decided. No-ops silently if
 *  they never linked an account. */
export async function notifyUser(userId: string, message: string): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { lineUserId: true } });
    if (!user?.lineUserId) return;
    await pushLineMessage(user.lineUserId, message);
  } catch (error) {
    logError("Failed to notify user", error, { userId });
  }
}
