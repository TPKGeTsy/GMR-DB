import { describe, it, expect } from "vitest";
import {
  validateLaborHireInput,
  summarizeLaborHires,
  computeLaborCost,
  paymentStatusOf,
  resolveLaborHire,
  normalizeName,
  buildVendorDirectory,
  rankVendors,
  contractLabel,
  type LaborHireInput,
  type DirectoryHire,
} from "./laborHire";

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
    ).toEqual({ records: 2, technicians: 3, laborers: 3, headcount: 6, cost: 5700, paid: 0, outstanding: 5700 });
  });

  it("returns zeros for no rows", () => {
    expect(summarizeLaborHires([])).toEqual({
      records: 0, technicians: 0, laborers: 0, headcount: 0, cost: 0, paid: 0, outstanding: 0,
    });
  });
});

describe("contract length", () => {
  it("labels fixed-term and daily-hire contracts", () => {
    expect(contractLabel("FIXED_TERM", 10)).toBe("สัญญา 10 วัน");
    expect(contractLabel("DAILY_HIRE", 3)).toBe("จ้างรายวัน 3 วัน");
  });

  it("defaults to a 1-day fixed-term contract", () => {
    const r = resolveLaborHire(valid);
    expect(r.contractType).toBe("FIXED_TERM");
    expect(r.days).toBe(1);
  });

  it("checks days in every cost mode, not just daily-rate", () => {
    expect(validateLaborHireInput({ ...valid, days: 0 })).toMatch(/จำนวนวัน/);
    expect(validateLaborHireInput({ ...valid, days: 366 })).toMatch(/จำนวนวัน/);
    expect(validateLaborHireInput({ ...valid, days: 2.5 })).toMatch(/จำนวนวัน/);
    expect(validateLaborHireInput({ ...valid, days: 30, contractType: "FIXED_TERM" })).toBeNull();
    expect(validateLaborHireInput({ ...valid, days: 4, contractType: "DAILY_HIRE" })).toBeNull();
  });

  it("rejects an unknown contract type", () => {
    expect(validateLaborHireInput({ ...valid, contractType: "WEEKLY" as never })).toBe("ประเภทสัญญาไม่ถูกต้อง");
  });
});

describe("daily-rate costing", () => {
  const daily: LaborHireInput = {
    ...valid,
    rateMode: "DAILY_RATE",
    days: 2,
    technicianCount: 2,
    laborerCount: 3,
    technicianRate: 900,
    laborerRate: 500,
    cost: 1, // must be ignored in this mode
  };

  it("computes days x (ช่าง x rate + คนงาน x rate)", () => {
    expect(computeLaborCost(daily)).toBe(2 * (2 * 900 + 3 * 500));
    expect(resolveLaborHire(daily).cost).toBe(6600);
  });

  it("ignores the typed cost so the total can't disagree with the rates", () => {
    expect(resolveLaborHire({ ...daily, cost: 999_999 }).cost).toBe(6600);
    expect(validateLaborHireInput({ ...daily, cost: -5 })).toBeNull();
  });

  it("needs a rate for each role that has people on it", () => {
    expect(validateLaborHireInput({ ...daily, technicianRate: null })).toBe("กรุณาระบุอัตราค่าจ้างช่างต่อวัน");
    expect(validateLaborHireInput({ ...daily, laborerRate: undefined })).toBe("กรุณาระบุอัตราค่าจ้างคนงานต่อวัน");
    // ...but not for a role with nobody on it
    expect(validateLaborHireInput({ ...daily, laborerCount: 0, laborerRate: null })).toBeNull();
  });

  it("bounds rates and the resulting total", () => {
    expect(validateLaborHireInput({ ...daily, technicianRate: 100_001 })).toBe("อัตราค่าจ้างช่างไม่ถูกต้อง");
    expect(validateLaborHireInput({ ...daily, days: 365, technicianRate: 100_000, technicianCount: 999 })).toBe(
      "ค่าใช้จ่ายรวมสูงเกินกำหนด"
    );
  });

  it("drops stale rates when switching back to a lump sum", () => {
    const r = resolveLaborHire({ ...daily, rateMode: "LUMP_SUM", cost: 3000 });
    expect(r.cost).toBe(3000);
    expect(r.technicianRate).toBeNull();
    expect(r.laborerRate).toBeNull();
  });
});

describe("named workers and agreed per-person rates", () => {
  const daily: LaborHireInput = {
    ...valid,
    rateMode: "DAILY_RATE",
    days: 2,
    technicianCount: 2,
    laborerCount: 3,
    technicianRate: 900,
    laborerRate: 500,
    cost: 0,
  };

  it("uses a person's own agreed rate, and the role rate for everyone else", () => {
    const withNames: LaborHireInput = {
      ...daily,
      workers: [
        { name: "สมชาย", role: "TECHNICIAN", dailyRate: 1200 }, // own rate
        { name: "สมศรี", role: "TECHNICIAN" }, // falls back to 900
        { name: "มานะ", role: "LABORER", dailyRate: 450 },
      ],
    };
    // technicians: 1200 + 900; laborers: 450 + 2 unnamed x 500; x 2 days
    expect(computeLaborCost({ ...withNames, workers: withNames.workers })).toBe(2 * (1200 + 900 + 450 + 2 * 500));
    expect(resolveLaborHire(withNames).cost).toBe(7100);
  });

  it("doesn't need a role rate when every person in that role has their own", () => {
    const allNamed: LaborHireInput = {
      ...daily,
      technicianRate: null,
      workers: [
        { name: "สมชาย", role: "TECHNICIAN", dailyRate: 1200 },
        { name: "สมศรี", role: "TECHNICIAN", dailyRate: 1000 },
      ],
    };
    expect(validateLaborHireInput(allNamed)).toBeNull();
    // ...but as soon as one has no agreed rate and there's no role rate, ask for it
    expect(
      validateLaborHireInput({
        ...allNamed,
        workers: [{ name: "สมชาย", role: "TECHNICIAN", dailyRate: 1200 }, { name: "สมศรี", role: "TECHNICIAN" }],
      })
    ).toBe("กรุณาระบุอัตราค่าจ้างช่างต่อวัน");
  });

  it("keeps agreed rates as plain records on a lump-sum hire", () => {
    const lump: LaborHireInput = { ...valid, workers: [{ name: "สมชาย", role: "TECHNICIAN", dailyRate: 1200 }] };
    expect(validateLaborHireInput(lump)).toBeNull();
    const r = resolveLaborHire(lump);
    expect(r.cost).toBe(4500);
    expect(r.workers).toEqual([{ name: "สมชาย", role: "TECHNICIAN", dailyRate: 1200, note: null }]);
  });

  it("drops blank rows and tidies names", () => {
    const r = resolveLaborHire({
      ...valid,
      workers: [
        { name: "   ", role: "LABORER" },
        { name: "  สมชาย   ใจดี ", role: "LABORER", dailyRate: 500, note: "  " },
      ],
    });
    expect(r.workers).toEqual([{ name: "สมชาย ใจดี", role: "LABORER", dailyRate: 500, note: null }]);
  });

  it("can't name more people than were hired in a role", () => {
    expect(
      validateLaborHireInput({
        ...valid,
        technicianCount: 1,
        workers: [
          { name: "ก", role: "TECHNICIAN" },
          { name: "ข", role: "TECHNICIAN" },
        ],
      })
    ).toBe("รายชื่อช่างมากกว่าจำนวนช่างที่ระบุ");
    expect(
      validateLaborHireInput({
        ...valid,
        laborerCount: 1,
        workers: [
          { name: "ก", role: "LABORER" },
          { name: "ข", role: "LABORER" },
        ],
      })
    ).toBe("รายชื่อคนงานมากกว่าจำนวนคนงานที่ระบุ");
  });

  it("rejects duplicate names (ignoring case/spacing), bad roles, and bad rates", () => {
    expect(
      validateLaborHireInput({
        ...valid,
        workers: [
          { name: "Somchai", role: "LABORER" },
          { name: "  somchai ", role: "LABORER" },
        ],
      })
    ).toMatch(/ซ้ำ/);
    expect(validateLaborHireInput({ ...valid, workers: [{ name: "ก", role: "BOSS" as never }] })).toMatch(/ตำแหน่ง/);
    expect(validateLaborHireInput({ ...valid, workers: [{ name: "ก", role: "LABORER", dailyRate: -5 }] })).toMatch(/ค่าแรงของ ก/);
    expect(validateLaborHireInput({ ...valid, workers: [{ name: "ก".repeat(81), role: "LABORER" }] })).toMatch(/ชื่อต้องไม่เกิน/);
  });
});

describe("payment tracking", () => {
  it("derives status from amounts", () => {
    expect(paymentStatusOf(0, 0)).toBe("NONE");
    expect(paymentStatusOf(4500, 0)).toBe("UNPAID");
    expect(paymentStatusOf(4500, 1000)).toBe("PARTIAL");
    expect(paymentStatusOf(4500, 4500)).toBe("PAID");
  });

  it("rejects paying more than the total, accepts partial and full", () => {
    expect(validateLaborHireInput({ ...valid, paidAmount: 4501 })).toBe("ยอดที่จ่ายแล้วเกินค่าใช้จ่ายรวม");
    expect(validateLaborHireInput({ ...valid, paidAmount: 4500, paidDateKey: "2026-10-13" })).toBeNull();
    expect(validateLaborHireInput({ ...valid, paidAmount: 100 })).toBeNull();
    expect(validateLaborHireInput({ ...valid, paidAmount: -1 })).toBe("ยอดที่จ่ายแล้วไม่ถูกต้อง");
  });

  it("checks the pay date only when something was paid, and drops it otherwise", () => {
    expect(validateLaborHireInput({ ...valid, paidAmount: 100, paidDateKey: "2026-13-40" })).toBe("วันที่จ่ายเงินไม่ถูกต้อง");
    expect(validateLaborHireInput({ ...valid, paidAmount: 0, paidDateKey: "garbage" })).toBeNull();
    expect(resolveLaborHire({ ...valid, paidAmount: 0, paidDateKey: "2026-10-13" }).paidDateKey).toBeNull();
  });

  it("totals paid and outstanding across rows", () => {
    const t = summarizeLaborHires([
      { technicianCount: 1, laborerCount: 0, cost: 1000, paidAmount: 1000 },
      { technicianCount: 0, laborerCount: 2, cost: 2000, paidAmount: 500 },
    ]);
    expect(t.paid).toBe(1500);
    expect(t.outstanding).toBe(1500);
  });
});

describe("company vs individual details", () => {
  it("defaults to a company hire with trimmed, null-when-blank text", () => {
    const r = resolveLaborHire({ ...valid, vendorName: "  บริษัท เอ บี ซี  ", trade: "" });
    expect(r.hireType).toBe("COMPANY");
    expect(r.vendorName).toBe("บริษัท เอ บี ซี");
    expect(r.trade).toBeNull();
    expect(r.rateMode).toBe("LUMP_SUM");
  });

  it("accepts all hire types and rejects unknown ones", () => {
    for (const hireType of ["COMPANY", "INDIVIDUAL", "MIXED"] as const) {
      expect(validateLaborHireInput({ ...valid, hireType })).toBeNull();
    }
    expect(validateLaborHireInput({ ...valid, hireType: "OTHER" as never })).toBe("รูปแบบการจ้างไม่ถูกต้อง");
    expect(validateLaborHireInput({ ...valid, rateMode: "HOURLY" as never })).toBe("วิธีคิดค่าจ้างไม่ถูกต้อง");
  });

  it("limits free-text field lengths", () => {
    expect(validateLaborHireInput({ ...valid, vendorName: "ก".repeat(121) })).toMatch(/ชื่อบริษัท/);
    expect(validateLaborHireInput({ ...valid, reference: "ก".repeat(61) })).toMatch(/เลขที่อ้างอิง/);
  });
});

// ---------------------------------------------------------------------------

function hire(over: Partial<DirectoryHire> & Pick<DirectoryHire, "id" | "dateKey">): DirectoryHire {
  return {
    title: "งาน",
    projectId: null,
    projectName: null,
    responsibleName: "เทสต์",
    vendorName: null,
    vendorPhone: null,
    hireType: "COMPANY",
    contractType: "FIXED_TERM",
    days: 1,
    technicianCount: 1,
    laborerCount: 0,
    rateMode: "LUMP_SUM",
    technicianRate: null,
    laborerRate: null,
    cost: 0,
    paidAmount: 0,
    trade: null,
    location: null,
    note: null,
    workers: [],
    ...over,
  };
}

describe("normalizeName", () => {
  it("ignores case and spacing differences", () => {
    expect(normalizeName("  บริษัท   ABC  ")).toBe("บริษัท abc");
    expect(normalizeName("ABC")).toBe(normalizeName("abc "));
  });
});

describe("buildVendorDirectory", () => {
  const hires: DirectoryHire[] = [
    hire({ id: "h1", dateKey: "2026-09-01", vendorName: "บริษัท ABC จำกัด", vendorPhone: "081-111", cost: 10000, days: 5, trade: "ช่างไฟ" }),
    hire({
      id: "h2",
      dateKey: "2026-10-05",
      vendorName: "บริษัท  abc จำกัด", // same company, different spacing/case
      vendorPhone: "082-222",
      cost: 5000,
      days: 3,
      workers: [
        { name: "สมชาย", role: "TECHNICIAN", dailyRate: 1200, note: null },
        { name: "มานะ", role: "LABORER", dailyRate: 500, note: null },
      ],
    }),
    hire({
      id: "h3",
      dateKey: "2026-10-10",
      hireType: "INDIVIDUAL",
      days: 4,
      workers: [{ name: " สมชาย ", role: "TECHNICIAN", dailyRate: 1300, note: "ช่างไฟ" }],
    }),
  ];
  const dir = buildVendorDirectory(hires);
  const by = (name: string) => dir.find((e) => e.key === normalizeName(name))!;

  it("groups the same company across jobs and sums what we paid it", () => {
    const abc = by("บริษัท ABC จำกัด");
    expect(abc.kind).toBe("COMPANY");
    expect(abc.times).toBe(2);
    expect(abc.totalCost).toBe(15000);
    expect(abc.firstDateKey).toBe("2026-09-01");
    expect(abc.lastDateKey).toBe("2026-10-05");
    expect(abc.jobs.map((j) => j.hireId)).toEqual(["h2", "h1"]); // newest first
  });

  it("uses the most recent phone and the first-seen trade", () => {
    const abc = by("บริษัท ABC จำกัด");
    expect(abc.phone).toBe("082-222");
    expect(abc.trade).toBe("ช่างไฟ");
  });

  it("tracks individuals across jobs with their agreed wage x days", () => {
    const somchai = by("สมชาย");
    expect(somchai.kind).toBe("PERSON");
    expect(somchai.times).toBe(2);
    // 1200 x 3 days (h2) + 1300 x 4 days (h3)
    expect(somchai.totalCost).toBe(1200 * 3 + 1300 * 4);
    expect(somchai.lastRate).toBe(1300); // most recent agreement
    expect(somchai.lastRole).toBe("TECHNICIAN");
    expect(somchai.jobs.map((j) => j.hireId)).toEqual(["h3", "h2"]);
  });

  it("leaves a person's total null when no rate was ever agreed", () => {
    const d = buildVendorDirectory([
      hire({ id: "x", dateKey: "2026-10-01", workers: [{ name: "ก", role: "LABORER", dailyRate: null, note: null }] }),
    ]);
    expect(d[0].totalCost).toBeNull();
    expect(d[0].times).toBe(1);
  });

  it("doesn't double-count someone who is both the contractor and a listed worker", () => {
    const d = buildVendorDirectory([
      hire({
        id: "y",
        dateKey: "2026-10-01",
        vendorName: "สมหมาย",
        hireType: "INDIVIDUAL",
        cost: 3000,
        days: 3,
        workers: [{ name: "สมหมาย", role: "TECHNICIAN", dailyRate: 1000, note: null }],
      }),
    ]);
    expect(d).toHaveLength(1);
    expect(d[0].times).toBe(1);
    expect(d[0].totalCost).toBe(3000); // the job cost once, not + 1000 x 3
    expect(d[0].jobs[0].worker?.dailyRate).toBe(1000);
    expect(d[0].lastRate).toBe(1000);
  });

  it("returns nothing for no hires", () => {
    expect(buildVendorDirectory([])).toEqual([]);
  });
});

describe("rankVendors", () => {
  const dir = buildVendorDirectory([
    hire({ id: "a", dateKey: "2026-10-01", vendorName: "บริษัท ABC จำกัด", cost: 1 }),
    hire({ id: "b", dateKey: "2026-10-02", vendorName: "ABC", cost: 1 }),
    hire({ id: "c", dateKey: "2026-10-03", vendorName: "ABC", cost: 1 }),
    hire({ id: "d", dateKey: "2026-10-04", vendorName: "ร้านสมชายการช่าง", cost: 1 }),
    hire({ id: "e", dateKey: "2026-10-05", workers: [{ name: "สมชาย ใจดี", role: "LABORER", dailyRate: 500, note: null }] }),
  ]);

  it("matches anywhere in the name, case-insensitively (LIKE %q%)", () => {
    expect(rankVendors(dir, "abc").map((e) => e.name)).toEqual(["ABC", "บริษัท ABC จำกัด"]);
    expect(rankVendors(dir, "สมชาย").map((e) => e.name).sort()).toEqual(["ร้านสมชายการช่าง", "สมชาย ใจดี"].sort());
  });

  it("puts an exact match first, then prefix, then the rest", () => {
    const names = rankVendors(dir, "ABC").map((e) => e.name);
    expect(names[0]).toBe("ABC");
  });

  it("matches every word in any order", () => {
    expect(rankVendors(dir, "จำกัด abc").map((e) => e.name)).toEqual(["บริษัท ABC จำกัด"]);
    expect(rankVendors(dir, "abc xyz")).toEqual([]);
  });

  it("returns everything newest-first for an empty query", () => {
    const names = rankVendors(dir, "  ").map((e) => e.name);
    expect(names[0]).toBe("สมชาย ใจดี"); // 2026-10-05
    expect(names).toHaveLength(4);
  });
});
