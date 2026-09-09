/** Whether a loan is past its due date and hasn't been returned yet. */
export function isLoanOverdue(dueDate: string | Date | null, returnedAt?: string | Date | null): boolean {
  if (!dueDate || returnedAt) return false;
  return new Date(dueDate).getTime() < Date.now();
}
