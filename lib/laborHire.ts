export const LABOR_MAX_HEADCOUNT = 999;
export const LABOR_MAX_COST = 10_000_000;
export const LABOR_MAX_RATE = 100_000;
export const LABOR_MAX_DAYS = 365;
export const LABOR_MAX_WORKERS = 100;
export const LABOR_TITLE_MAX = 120;
export const LABOR_NOTE_MAX = 500;
export const LABOR_WORKER_NAME_MAX = 80;

// COMPANY: hired through a contractor/company. INDIVIDUAL: hired person by
// person. MIXED: both on the same job.
export const HIRE_TYPES = ["COMPANY", "INDIVIDUAL", "MIXED"] as const;
export type HireType = (typeof HIRE_TYPES)[number];
export const hireTypeLabel: Record<HireType, string> = {
  COMPANY: "บริษัท/ผู้รับเหมา",
  INDIVIDUAL: "รายบุคคล",
  MIXED: "ทั้งสองแบบ",
};

// FIXED_TERM: a contract for a set number of days. DAILY_HIRE: hired by the
// day with no fixed length — `days` then counts days hired so far.
export const CONTRACT_TYPES = ["FIXED_TERM", "DAILY_HIRE"] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];
export const contractTypeLabel: Record<ContractType, string> = {
  FIXED_TERM: "สัญญากำหนดวัน",
  DAILY_HIRE: "จ้างรายวัน",
};
export function contractLabel(type: ContractType, days: number): string {
  return type === "DAILY_HIRE" ? `จ้างรายวัน ${days} วัน` : `สัญญา ${days} วัน`;
}

// LUMP_SUM: the total is typed in. DAILY_RATE: total is computed from
// days x headcount x per-person daily rate, so it can never disagree with
// the rates shown next to it.
export const RATE_MODES = ["LUMP_SUM", "DAILY_RATE"] as const;
export type RateMode = (typeof RATE_MODES)[number];

export const WORKER_ROLES = ["TECHNICIAN", "LABORER"] as const;
export type WorkerRole = (typeof WORKER_ROLES)[number];
export const workerRoleLabel: Record<WorkerRole, string> = { TECHNICIAN: "ช่าง", LABORER: "คนงาน" };

export interface LaborWorkerInput {
  name: string;
  role: WorkerRole;
  /** Agreed บาท/วัน for this person; null = fall back to the role rate. */
  dailyRate?: number | null;
  note?: string | null;
}

export interface LaborHireInput {
  dateKey: string;
  title: string;
  responsibleId: string;
  projectId?: string | null;
  technicianCount: number;
  laborerCount: number;
  /** Used as-is for LUMP_SUM; ignored (recomputed) for DAILY_RATE. */
  cost: number;
  note?: string | null;
  // Everything below is optional so older callers/rows keep working — see
  // resolveLaborHire for the defaults.
  hireType?: HireType;
  vendorName?: string | null;
  vendorPhone?: string | null;
  trade?: string | null;
  location?: string | null;
  reference?: string | null;
  contractType?: ContractType;
  days?: number;
  rateMode?: RateMode;
  technicianRate?: number | null;
  laborerRate?: number | null;
  paidAmount?: number;
  paidDateKey?: string | null;
  workers?: LaborWorkerInput[];
}

const MAX_LEN = { vendorName: 120, vendorPhone: 30, trade: 60, location: 120, reference: 60 } as const;

function clean(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

/** Same name typed with different spacing/case should count as one. */
export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function isRealDateKey(dateKey: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  const d = new Date(`${dateKey}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dateKey;
}

function isCount(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= LABOR_MAX_HEADCOUNT;
}

function isMoney(n: unknown, max: number): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= max;
}

/** Workers with a name, trimmed — blank rows from the form are just dropped. */
function cleanWorkers(workers: LaborWorkerInput[] | undefined) {
  return (workers ?? [])
    .map((w) => ({
      name: w.name?.trim().replace(/\s+/g, " ") ?? "",
      role: w.role,
      dailyRate: w.dailyRate ?? null,
      note: clean(w.note),
    }))
    .filter((w) => w.name !== "");
}

/** Total for a daily-rate hire: every named worker at their own agreed rate
 *  (or the role rate when none was agreed), plus whoever is hired but not
 *  named, at the role rate — all x days. Lump-sum hires just use `cost`. */
export function computeLaborCost(d: {
  rateMode?: RateMode;
  cost: number;
  days?: number;
  technicianCount: number;
  laborerCount: number;
  technicianRate?: number | null;
  laborerRate?: number | null;
  workers?: { role: WorkerRole; dailyRate?: number | null }[];
}): number {
  if (d.rateMode !== "DAILY_RATE") return d.cost;

  let perDay = 0;
  for (const [role, count, roleRate] of [
    ["TECHNICIAN", d.technicianCount, d.technicianRate ?? 0],
    ["LABORER", d.laborerCount, d.laborerRate ?? 0],
  ] as const) {
    const named = (d.workers ?? []).filter((w) => w.role === role);
    for (const w of named) perDay += w.dailyRate ?? roleRate;
    perDay += Math.max(0, count - named.length) * roleRate;
  }
  return (d.days ?? 1) * perDay;
}

export type PaymentStatus = "NONE" | "UNPAID" | "PARTIAL" | "PAID";

/** Derived from the amounts rather than stored, so it can't drift. */
export function paymentStatusOf(cost: number, paidAmount: number): PaymentStatus {
  if (cost <= 0) return "NONE";
  if (paidAmount >= cost) return "PAID";
  if (paidAmount > 0) return "PARTIAL";
  return "UNPAID";
}

/** Fills defaults, trims text, and computes the effective total. The one
 *  place that decides what actually gets stored. */
export function resolveLaborHire(data: LaborHireInput) {
  const rateMode: RateMode = data.rateMode ?? "LUMP_SUM";
  const days = data.days ?? 1;
  const technicianRate = rateMode === "DAILY_RATE" ? data.technicianRate ?? null : null;
  const laborerRate = rateMode === "DAILY_RATE" ? data.laborerRate ?? null : null;
  const workers = cleanWorkers(data.workers);
  const cost = computeLaborCost({ ...data, rateMode, days, technicianRate, laborerRate, workers });
  const paidAmount = data.paidAmount ?? 0;

  return {
    dateKey: data.dateKey,
    title: data.title.trim(),
    projectId: data.projectId || null,
    responsibleId: data.responsibleId,
    technicianCount: data.technicianCount,
    laborerCount: data.laborerCount,
    cost,
    note: clean(data.note),
    hireType: data.hireType ?? ("COMPANY" as HireType),
    vendorName: clean(data.vendorName),
    vendorPhone: clean(data.vendorPhone),
    trade: clean(data.trade),
    location: clean(data.location),
    reference: clean(data.reference),
    contractType: data.contractType ?? ("FIXED_TERM" as ContractType),
    days,
    rateMode,
    technicianRate,
    laborerRate,
    paidAmount,
    paidDateKey: paidAmount > 0 ? clean(data.paidDateKey) : null,
    workers,
  };
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
  if ((data.note?.trim().length ?? 0) > LABOR_NOTE_MAX) return `หมายเหตุต้องไม่เกิน ${LABOR_NOTE_MAX} ตัวอักษร`;

  if (data.hireType !== undefined && !HIRE_TYPES.includes(data.hireType)) return "รูปแบบการจ้างไม่ถูกต้อง";
  if (data.rateMode !== undefined && !RATE_MODES.includes(data.rateMode)) return "วิธีคิดค่าจ้างไม่ถูกต้อง";
  if (data.contractType !== undefined && !CONTRACT_TYPES.includes(data.contractType)) return "ประเภทสัญญาไม่ถูกต้อง";
  // Days is a real field (contract length / days hired so far), not just an
  // input to daily-rate costing, so it's checked in every mode.
  const days = data.days ?? 1;
  if (!Number.isInteger(days) || days < 1 || days > LABOR_MAX_DAYS) return `จำนวนวันต้องเป็น 1-${LABOR_MAX_DAYS}`;

  for (const [key, label] of [
    ["vendorName", "ชื่อบริษัท/ผู้รับเหมา"],
    ["vendorPhone", "เบอร์โทร"],
    ["trade", "ประเภทช่าง/งาน"],
    ["location", "สถานที่"],
    ["reference", "เลขที่อ้างอิง"],
  ] as const) {
    if ((data[key]?.trim().length ?? 0) > MAX_LEN[key]) return `${label}ต้องไม่เกิน ${MAX_LEN[key]} ตัวอักษร`;
  }

  const workers = cleanWorkers(data.workers);
  if (workers.length > LABOR_MAX_WORKERS) return `ระบุรายชื่อได้ไม่เกิน ${LABOR_MAX_WORKERS} คนต่องาน`;
  const seen = new Set<string>();
  for (const w of workers) {
    if (w.name.length > LABOR_WORKER_NAME_MAX) return `ชื่อต้องไม่เกิน ${LABOR_WORKER_NAME_MAX} ตัวอักษร`;
    if (!WORKER_ROLES.includes(w.role)) return "ตำแหน่ง (ช่าง/คนงาน) ไม่ถูกต้อง";
    if (w.dailyRate !== null && !isMoney(w.dailyRate, LABOR_MAX_RATE)) return `ค่าแรงของ ${w.name} ไม่ถูกต้อง`;
    const key = normalizeName(w.name);
    if (seen.has(key)) return `มีชื่อ "${w.name}" ซ้ำในรายการ`;
    seen.add(key);
  }
  const namedTechs = workers.filter((w) => w.role === "TECHNICIAN").length;
  const namedLaborers = workers.filter((w) => w.role === "LABORER").length;
  if (namedTechs > data.technicianCount) return "รายชื่อช่างมากกว่าจำนวนช่างที่ระบุ";
  if (namedLaborers > data.laborerCount) return "รายชื่อคนงานมากกว่าจำนวนคนงานที่ระบุ";

  const rateMode = data.rateMode ?? "LUMP_SUM";
  if (rateMode === "LUMP_SUM") {
    if (!isMoney(data.cost, LABOR_MAX_COST)) return "ค่าใช้จ่ายไม่ถูกต้อง";
  } else {
    // Every person needs some rate: their own, or the role's.
    for (const [role, count, rate, label] of [
      ["TECHNICIAN", data.technicianCount, data.technicianRate, "ช่าง"],
      ["LABORER", data.laborerCount, data.laborerRate, "คนงาน"],
    ] as const) {
      const named = workers.filter((w) => w.role === role);
      const needsRoleRate = count > named.length || named.some((w) => w.dailyRate === null);
      if (needsRoleRate && rate == null) return `กรุณาระบุอัตราค่าจ้าง${label}ต่อวัน`;
      if (rate != null && !isMoney(rate, LABOR_MAX_RATE)) return `อัตราค่าจ้าง${label}ไม่ถูกต้อง`;
    }
    if (computeLaborCost({ ...data, rateMode, days, workers }) > LABOR_MAX_COST) return "ค่าใช้จ่ายรวมสูงเกินกำหนด";
  }

  const paid = data.paidAmount ?? 0;
  if (!isMoney(paid, LABOR_MAX_COST)) return "ยอดที่จ่ายแล้วไม่ถูกต้อง";
  if (paid > resolveLaborHire(data).cost) return "ยอดที่จ่ายแล้วเกินค่าใช้จ่ายรวม";
  const paidDate = clean(data.paidDateKey);
  if (paid > 0 && paidDate && !isRealDateKey(paidDate)) return "วันที่จ่ายเงินไม่ถูกต้อง";

  return null;
}

export interface LaborHireTotals {
  records: number;
  technicians: number;
  laborers: number;
  headcount: number;
  cost: number;
  paid: number;
  outstanding: number;
}

export function summarizeLaborHires(
  rows: { technicianCount: number; laborerCount: number; cost: number; paidAmount?: number }[]
): LaborHireTotals {
  const totals: LaborHireTotals = {
    records: rows.length,
    technicians: 0,
    laborers: 0,
    headcount: 0,
    cost: 0,
    paid: 0,
    outstanding: 0,
  };
  for (const r of rows) {
    totals.technicians += r.technicianCount;
    totals.laborers += r.laborerCount;
    totals.cost += r.cost;
    totals.paid += r.paidAmount ?? 0;
  }
  totals.headcount = totals.technicians + totals.laborers;
  totals.outstanding = Math.max(0, totals.cost - totals.paid);
  return totals;
}

// ---------------------------------------------------------------------------
// Consult history: "who have we hired before" — derived from the log itself
// rather than kept in a second table, so an entry can never disagree with the
// records it summarizes.
// ---------------------------------------------------------------------------

export interface DirectoryWorker {
  name: string;
  role: WorkerRole;
  dailyRate: number | null;
  note: string | null;
}

export interface DirectoryHire {
  id: string;
  dateKey: string;
  title: string;
  projectId: string | null;
  projectName: string | null;
  responsibleName: string;
  vendorName: string | null;
  vendorPhone: string | null;
  hireType: HireType;
  contractType: ContractType;
  days: number;
  technicianCount: number;
  laborerCount: number;
  rateMode: RateMode;
  technicianRate: number | null;
  laborerRate: number | null;
  cost: number;
  paidAmount: number;
  trade: string | null;
  location: string | null;
  note: string | null;
  workers: DirectoryWorker[];
}

export interface VendorJob {
  hireId: string;
  dateKey: string;
  /** This entry was the contractor on the job (vs. only listed as a worker). */
  asVendor: boolean;
  /** Their own line on the job (role + agreed daily rate), when listed. */
  worker: DirectoryWorker | null;
  /** What this job adds to the entry's total: the whole job cost when they
   *  were the contractor, otherwise their agreed daily rate x the job's days
   *  (null when no rate was agreed). */
  contribution: number | null;
}

export interface VendorEntry {
  key: string;
  name: string;
  /** COMPANY = a contractor/company we hired through; PERSON = an individual. */
  kind: "COMPANY" | "PERSON";
  phone: string | null;
  trade: string | null;
  times: number;
  firstDateKey: string;
  lastDateKey: string;
  totalCost: number | null;
  /** Role and agreed rate from the most recent time they were listed as a
   *  worker — pre-fills the form when hiring them again. */
  lastRole: WorkerRole | null;
  lastRate: number | null;
  jobs: VendorJob[];
}

export function buildVendorDirectory(hires: DirectoryHire[]): VendorEntry[] {
  // Newest first, so "latest phone/trade/rate wins" is just "first one seen".
  const ordered = [...hires].sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  const map = new Map<string, VendorEntry>();

  const entryFor = (key: string, name: string, kind: "COMPANY" | "PERSON", dateKey: string): VendorEntry => {
    let entry = map.get(key);
    if (!entry) {
      entry = {
        key,
        name,
        kind,
        phone: null,
        trade: null,
        times: 0,
        firstDateKey: dateKey,
        lastDateKey: dateKey,
        totalCost: null,
        lastRole: null,
        lastRate: null,
        jobs: [],
      };
      map.set(key, entry);
    }
    entry.times += 1;
    entry.firstDateKey = dateKey; // descending order, so this ends up the earliest
    return entry;
  };

  const addContribution = (entry: VendorEntry, amount: number | null) => {
    if (amount !== null) entry.totalCost = (entry.totalCost ?? 0) + amount;
  };

  for (const hire of ordered) {
    const vendorKey = hire.vendorName ? normalizeName(hire.vendorName) : "";
    let vendorEntry: VendorEntry | null = null;
    let vendorJob: VendorJob | null = null;

    if (vendorKey) {
      vendorEntry = entryFor(
        vendorKey,
        hire.vendorName!.trim().replace(/\s+/g, " "),
        hire.hireType === "INDIVIDUAL" ? "PERSON" : "COMPANY",
        hire.dateKey
      );
      // A name ever used as the contractor on a company job is COMPANY-type.
      if (hire.hireType !== "INDIVIDUAL") vendorEntry.kind = "COMPANY";
      vendorEntry.phone ??= hire.vendorPhone;
      vendorEntry.trade ??= hire.trade;
      vendorJob = { hireId: hire.id, dateKey: hire.dateKey, asVendor: true, worker: null, contribution: hire.cost };
      vendorEntry.jobs.push(vendorJob);
      addContribution(vendorEntry, hire.cost);
    }

    const seenInHire = new Set<string>();
    for (const w of hire.workers) {
      const key = normalizeName(w.name);
      if (!key || seenInHire.has(key)) continue;
      seenInHire.add(key);

      if (key === vendorKey && vendorEntry && vendorJob) {
        // Same person is both the contractor and a listed worker: attach the
        // worker line to the job already counted rather than counting twice.
        vendorJob.worker = w;
        vendorEntry.lastRole ??= w.role;
        vendorEntry.lastRate ??= w.dailyRate;
        continue;
      }

      const entry = entryFor(key, w.name.trim().replace(/\s+/g, " "), "PERSON", hire.dateKey);
      const contribution = w.dailyRate !== null ? w.dailyRate * hire.days : null;
      entry.trade ??= w.note;
      entry.lastRole ??= w.role;
      entry.lastRate ??= w.dailyRate;
      entry.jobs.push({ hireId: hire.id, dateKey: hire.dateKey, asVendor: false, worker: w, contribution });
      addContribution(entry, contribution);
    }
  }

  for (const entry of map.values()) {
    entry.lastDateKey = entry.jobs[0]?.dateKey ?? entry.lastDateKey;
  }
  return [...map.values()];
}

/** Case-insensitive "LIKE %token%" on every whitespace-separated word, so
 *  "abc บริษัท" still finds "บริษัท ABC จำกัด". Best matches first (exact,
 *  then prefix, then anywhere), then most-hired, then most recent. An empty
 *  query returns everything ordered by recency. */
export function rankVendors(entries: VendorEntry[], query: string): VendorEntry[] {
  const q = normalizeName(query);
  const tokens = q.split(" ").filter(Boolean);

  const score = (e: VendorEntry): number => {
    if (e.key === q) return 0;
    if (e.key.startsWith(q)) return 1;
    return 2;
  };

  return entries
    .filter((e) => tokens.every((t) => e.key.includes(t)))
    .sort((a, b) => {
      if (tokens.length) {
        const sa = score(a);
        const sb = score(b);
        if (sa !== sb) return sa - sb;
        if (a.times !== b.times) return b.times - a.times;
      }
      return b.lastDateKey.localeCompare(a.lastDateKey) || a.name.localeCompare(b.name);
    });
}
