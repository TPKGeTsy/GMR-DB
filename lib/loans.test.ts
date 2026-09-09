import { describe, it, expect } from "vitest";
import { isLoanOverdue } from "./loans";

describe("isLoanOverdue", () => {
  it("is false when there is no due date", () => {
    expect(isLoanOverdue(null)).toBe(false);
  });

  it("is true when the due date has passed and it hasn't been returned", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect(isLoanOverdue(yesterday)).toBe(true);
  });

  it("is false when the due date is still in the future", () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    expect(isLoanOverdue(tomorrow)).toBe(false);
  });

  it("is false once the loan has been returned, even if it was overdue", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const returnedAt = new Date().toISOString();
    expect(isLoanOverdue(yesterday, returnedAt)).toBe(false);
  });
});
