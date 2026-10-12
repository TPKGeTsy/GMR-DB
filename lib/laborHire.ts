export const LABOR_MAX_HEADCOUNT = 999;
export const LABOR_MAX_COST = 10_000_000;
export const LABOR_TITLE_MAX = 120;
export const LABOR_NOTE_MAX = 500;

export interface LaborHireInput {
  dateKey: string;
  title: string;
  responsibleId: string;
  projectId?: string | null;
  technicianCount: number;
  laborerCount: number;
  cost: number;
  note?: string | null;
}

function isRealDateKey(dateKey: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  const d = new Date(`${dateKey}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dateKey;
}

function isCount(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= LABOR_MAX_HEADCOUNT;
}

/** Returns a Thai error message for the first problem found, or null when
 *  the input is fine. Shared by create and update so both enforce the same
 *  rules. */
export function validateLaborHireInput(data: LaborHireInput): string | null {
  if (!isRealDateKey(data.dateKey)) return "วันที่ไม่ถูกต้อง";
  const title = data.title?.trim() ?? "";
  if (!title) return "กรุณาระบุหัวข้องาน";
  if (title.length > LABOR_TITLE_MAX) return `หัวข้องานต้องไม่เกิน ${LABOR_TITLE_MAX} ตัวอักษร`;
  if (!data.responsibleId) return "กรุณาเลือกผู้รับผิดชอบ";
  if (!isCount(data.technicianCount) || !isCount(data.laborerCount)) {
    return `จำนวนคนต้องเป็นจำนวนเต็ม 0-${LABOR_MAX_HEADCOUNT}`;
  }
  if (data.technicianCount + data.laborerCount === 0) return "ต้องมีช่างหรือคนงานอย่างน้อย 1 คน";
  if (typeof data.cost !== "number" || !Number.isInteger(data.cost) || data.cost < 0 || data.cost > LABOR_MAX_COST) {
    return "ค่าใช้จ่ายไม่ถูกต้อง";
  }
  if ((data.note?.trim().length ?? 0) > LABOR_NOTE_MAX) return `หมายเหตุต้องไม่เกิน ${LABOR_NOTE_MAX} ตัวอักษร`;
  return null;
}

export interface LaborHireTotals {
  records: number;
  technicians: number;
  laborers: number;
  headcount: number;
  cost: number;
}

export function summarizeLaborHires(
  rows: { technicianCount: number; laborerCount: number; cost: number }[]
): LaborHireTotals {
  const totals: LaborHireTotals = { records: rows.length, technicians: 0, laborers: 0, headcount: 0, cost: 0 };
  for (const r of rows) {
    totals.technicians += r.technicianCount;
    totals.laborers += r.laborerCount;
    totals.cost += r.cost;
  }
  totals.headcount = totals.technicians + totals.laborers;
  return totals;
}
