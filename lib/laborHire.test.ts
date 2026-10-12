import { describe, it, expect } from "vitest";
import { validateLaborHireInput, summarizeLaborHires, type LaborHireInput } from "./laborHire";

const valid: LaborHireInput = {
  dateKey: "2026-10-12",
  title: "ติดตั้งตู้คอนโทรล Sharp",
  responsibleId: "user-1",
  technicianCount: 2,
  laborerCount: 3,
  cost: 4500,
};

describe("validateLaborHireInput", () => {
  it("accepts a normal entry", () => {
    expect(validateLaborHireInput(valid)).toBeNull();
  });

  it("accepts technicians only or laborers only", () => {
    expect(validateLaborHireInput({ ...valid, laborerCount: 0 })).toBeNull();
    expect(validateLaborHireInput({ ...valid, technicianCount: 0 })).toBeNull();
  });

  it("accepts a zero cost (e.g. cost not known yet)", () => {
    expect(validateLaborHireInput({ ...valid, cost: 0 })).toBeNull();
  });

  it("rejects an impossible or malformed date", () => {
    expect(validateLaborHireInput({ ...valid, dateKey: "2026-02-30" })).toBe("วันที่ไม่ถูกต้อง");
    expect(validateLaborHireInput({ ...valid, dateKey: "12/10/2026" })).toBe("วันที่ไม่ถูกต้อง");
  });

  it("requires a non-blank title and a responsible person", () => {
    expect(validateLaborHireInput({ ...valid, title: "   " })).toBe("กรุณาระบุหัวข้องาน");
    expect(validateLaborHireInput({ ...valid, responsibleId: "" })).toBe("กรุณาเลือกผู้รับผิดชอบ");
  });

  it("requires at least one outside worker", () => {
    expect(validateLaborHireInput({ ...valid, technicianCount: 0, laborerCount: 0 })).toBe(
      "ต้องมีช่างหรือคนงานอย่างน้อย 1 คน"
    );
  });

  it("rejects fractional, negative, or absurd headcounts", () => {
    expect(validateLaborHireInput({ ...valid, technicianCount: 1.5 })).toMatch(/จำนวนเต็ม/);
    expect(validateLaborHireInput({ ...valid, laborerCount: -1 })).toMatch(/จำนวนเต็ม/);
    expect(validateLaborHireInput({ ...valid, laborerCount: 1000 })).toMatch(/จำนวนเต็ม/);
    expect(validateLaborHireInput({ ...valid, technicianCount: NaN })).toMatch(/จำนวนเต็ม/);
  });

  it("rejects a negative, fractional, or absurd cost", () => {
    expect(validateLaborHireInput({ ...valid, cost: -1 })).toBe("ค่าใช้จ่ายไม่ถูกต้อง");
    expect(validateLaborHireInput({ ...valid, cost: 99.5 })).toBe("ค่าใช้จ่ายไม่ถูกต้อง");
    expect(validateLaborHireInput({ ...valid, cost: 10_000_001 })).toBe("ค่าใช้จ่ายไม่ถูกต้อง");
  });
});

describe("summarizeLaborHires", () => {
  it("totals records, people, and cost", () => {
    expect(
      summarizeLaborHires([
        { technicianCount: 2, laborerCount: 3, cost: 4500 },
        { technicianCount: 1, laborerCount: 0, cost: 1200 },
      ])
    ).toEqual({ records: 2, technicians: 3, laborers: 3, headcount: 6, cost: 5700 });
  });

  it("returns zeros for no rows", () => {
    expect(summarizeLaborHires([])).toEqual({ records: 0, technicians: 0, laborers: 0, headcount: 0, cost: 0 });
  });
});
