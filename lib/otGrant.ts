import prisma from "./prisma";
import { REGULAR_HOURS_CAP, LUNCH_BREAK_HOURS, buildDailySummary } from "./attendance";
import { bangkokDateKey } from "./datetime";

// When OT starts counting from, for turning granted hours into an actual
// WorkSchedule time block — same 8-worked-hours-plus-untracked-lunch mark
// the reminder cron uses to decide when to auto-checkout.
export const EXPECTED_SPAN_MS = (REGULAR_HOURS_CAP + LUNCH_BREAK_HOURS) * 3_600_000;

/** The actual grant: sets the CheckIn's OT fields (extending the reminder
 *  cron's auto-checkout deadline), adds a matching Work Schedule block, and
 *  writes the permanent OtGrant audit row. Shared by every path that grants
 *  OT — the LINE operator button flow, the web OT-request approval action,
 *  and (once built) the self-serve-request LINE approval flow — so they all
 *  produce an identical grant instead of near-duplicate implementations.
 *  `cleanupPendingOtGrantId`, when given, deletes that LinePendingOtGrant row
 *  in the same transaction — only the LINE operator flow has one to clean up. */
export async function grantOtToUser(params: {
  userId: string;
  hours: number;
  reason: string;
  grantedById: string;
  openCheckIn: { id: string; createdAt: Date; note: string | null };
  cleanupPendingOtGrantId?: string;
}) {
  const { userId, hours, reason, grantedById, openCheckIn, cleanupPendingOtGrantId } = params;
  const combinedNote = openCheckIn.note ? `${openCheckIn.note} | OT: ${reason}` : `OT: ${reason}`;
  const otStart = new Date(openCheckIn.createdAt.getTime() + EXPECTED_SPAN_MS);
  const otEnd = new Date(otStart.getTime() + hours * 3_600_000);

  // An interactive transaction (not the array form) so the OtGrant row can
  // record the exact CheckIn/WorkSchedule rows it created — a decline later
  // needs those ids back to undo precisely those two rows, not just "the
  // employee's current open session," which could've moved on by then.
  return prisma.$transaction(async (tx) => {
    await tx.checkIn.update({
      where: { id: openCheckIn.id },
      data: { otGrantedHours: hours, otGrantedById: grantedById, otGrantedAt: new Date(), note: combinedNote },
    });
    const schedule = await tx.workSchedule.create({
      data: { userId, title: "ทำงานล่วงเวลา (OT)", startAt: otStart, endAt: otEnd, note: reason },
    });
    const created = await tx.otGrant.create({
      data: { userId, hours, reason, grantedById, checkInId: openCheckIn.id, workScheduleId: schedule.id },
    });
    if (cleanupPendingOtGrantId) {
      await tx.linePendingOtGrant.delete({ where: { id: cleanupPendingOtGrantId } });
    }
    return created;
  });
}

/** A person can only have one open "IN" session at a time (recordCheckIn
 *  enforces this for the face-scan kiosk too) — so the latest CheckIn row
 *  being type "IN" reliably means they're still clocked in right now. */
export async function getOpenCheckIn(userId: string) {
  const latest = await prisma.checkIn.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
  return latest?.type === "IN" ? latest : null;
}

/** Call once a trip-registered OUTSIDE session (CheckIn.tripId set) actually
 *  closes (self-serve "เลิกงานแล้ว" or the cron's midnight safety-net
 *  checkout) — turns an APPROVED OtApprovalRequest into the permanent
 *  OtGrant record, now that the session's real hours are known. No-ops if
 *  there's no approved request for it, or a grant already exists (guards
 *  against double-realizing on a race between checkout paths).
 *
 *  Hours come from that calendar day's computed otHours (buildDailySummary),
 *  not a per-session split — the day is the granularity the rest of the app
 *  (Attendance table, /ot/summary) already reports OT at, so this stays
 *  consistent with what an admin sees elsewhere rather than introducing a
 *  finer-grained number nothing else shows. */
export async function realizeOutsideTripOtGrant(checkInId: string, userId: string) {
  const request = await prisma.otApprovalRequest.findFirst({
    where: { checkInId, source: "OUTSIDE_AUTO", status: "APPROVED" },
  });
  if (!request || !request.decidedById) return;

  const alreadyGranted = await prisma.otGrant.findFirst({ where: { checkInId } });
  if (alreadyGranted) return;

  const openCheckIn = await prisma.checkIn.findUnique({ where: { id: checkInId } });
  if (!openCheckIn) return;

  const events = await prisma.checkIn.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { type: true, location: true, createdAt: true, otStartOverride: true },
  });
  const dateKey = bangkokDateKey(openCheckIn.createdAt);
  const dayRow = buildDailySummary(events).find((d) => d.dateKey === dateKey);
  const otHours = dayRow?.otHours ?? 0;
  if (otHours <= 0) return;

  await prisma.otGrant.create({
    data: {
      userId,
      hours: otHours,
      reason: request.location ? `ทำงานนอกสถานที่ (${request.location})` : "ทำงานนอกสถานที่",
      grantedById: request.decidedById,
      status: "ACCEPTED",
      checkInId,
    },
  });
}
