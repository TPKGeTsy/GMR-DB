import { getComponent, getPin } from "./library";
import type { ComponentDef, Pin } from "./types";

export type IssueSeverity = "error" | "warning";

export interface Issue {
  severity: IssueSeverity;
  message: string;
  /** The wire the issue is about (to highlight it). */
  edgeId?: string;
}

interface NodeLike {
  id: string;
  type?: string;
  data?: Record<string, unknown>;
}

interface EdgeLike {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

interface End {
  node: NodeLike;
  def: ComponentDef;
  pin: Pin;
}

const VOLT_TOLERANCE = 0.35;
const volts = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1)} V`;

/** What a pin is called in a message: "ESP32 DevKit V1 · GPIO21". */
export function pinTitle(def: ComponentDef, pin: Pin, node?: NodeLike): string {
  const label = typeof node?.data?.label === "string" && node.data.label.trim() ? (node.data.label as string) : def.name;
  return `${label} · ${pin.name}`;
}

function endOf(node: NodeLike | undefined, handle: string | null | undefined): End | null {
  if (!node || node.type !== "board") return null;
  const def = getComponent(node.data?.libraryId);
  const pin = def ? getPin(def, handle) : undefined;
  return def && pin ? { node, def, pin } : null;
}

const isSignal = (p: Pin) => p.kind === "io" || p.kind === "analog" || p.kind === "control" || p.kind === "bus";

/** Checks one wire between two library pins. */
function checkWire(a: End, b: End): { severity: IssueSeverity; message: string }[] {
  const out: { severity: IssueSeverity; message: string }[] = [];
  const name = `${pinTitle(a.def, a.pin, a.node)} ↔ ${pinTitle(b.def, b.pin, b.node)}`;
  const pa = a.pin;
  const pb = b.pin;

  if (a.node.id === b.node.id) {
    out.push({ severity: "warning", message: `${name}: สายวนกลับในอุปกรณ์เดียวกัน` });
  }

  const kinds = [pa.kind, pb.kind];
  const has = (k: string) => kinds.includes(k as never);

  // Supply to ground is a short circuit.
  if (has("power") && has("ground")) {
    out.push({ severity: "error", message: `${name}: ลัดวงจร — ต่อขั้วไฟเข้า GND โดยตรง` });
    return out;
  }

  // Two supplies of different voltage.
  if (pa.kind === "power" && pb.kind === "power" && pa.voltage !== undefined && pb.voltage !== undefined) {
    if (Math.abs(pa.voltage - pb.voltage) > VOLT_TOLERANCE) {
      out.push({ severity: "error", message: `${name}: แรงดันไม่เท่ากัน (${volts(pa.voltage)} กับ ${volts(pb.voltage)})` });
    }
  }

  // A supply on a signal pin.
  for (const [power, other] of [[pa, pb], [pb, pa]] as const) {
    if (power.kind === "power" && isSignal(other)) {
      const limit = other.maxIn ?? other.voltage;
      if (power.voltage !== undefined && limit !== undefined && power.voltage > limit + VOLT_TOLERANCE) {
        out.push({ severity: "error", message: `${name}: ไฟ ${volts(power.voltage)} เข้าพินสัญญาณที่รับได้ไม่เกิน ${volts(limit)} — อุปกรณ์เสียหายได้` });
      } else {
        out.push({ severity: "warning", message: `${name}: ต่อขั้วไฟเข้าพินสัญญาณ ตรวจว่าตั้งใจหรือไม่` });
      }
    }
  }

  // Ground on a signal pin.
  for (const [ground, other] of [[pa, pb], [pb, pa]] as const) {
    if (ground.kind === "ground" && isSignal(other)) {
      out.push({ severity: "warning", message: `${name}: ต่อ GND เข้าพินสัญญาณ ตรวจว่าตั้งใจหรือไม่` });
    }
  }

  // Logic level against what the other pin tolerates.
  if (isSignal(pa) && isSignal(pb)) {
    for (const [from, to] of [[pa, pb], [pb, pa]] as const) {
      const limit = to.maxIn ?? to.voltage;
      if (from.voltage !== undefined && limit !== undefined && from.voltage > limit + VOLT_TOLERANCE) {
        out.push({
          severity: "error",
          message: `${name}: สัญญาณ ${volts(from.voltage)} (${from.name}) เข้าพิน ${to.name} ที่รับได้ไม่เกิน ${volts(limit)} — ต้องมีตัวลดระดับสัญญาณ (level shifter / ตัวต้านทานแบ่งแรงดัน)`,
        });
      }
    }
  }

  // Relay contacts switch a load; they are not logic pins.
  if ((pa.kind === "relay" && isSignal(pb)) || (pb.kind === "relay" && isSignal(pa))) {
    out.push({ severity: "error", message: `${name}: หน้าสัมผัสรีเลย์ต่อเข้าพินสัญญาณโดยตรง — ใช้เป็นสวิตช์ของโหลด ไม่ใช่สัญญาณลอจิก` });
  }

  // Pins to avoid.
  for (const e of [a, b]) {
    if (e.pin.avoid) out.push({ severity: "warning", message: `${pinTitle(e.def, e.pin, e.node)}: ${e.pin.avoid}` });
  }

  return out;
}

/** Looks over every wire between library parts. Old / free-form nodes are not checked. */
export function checkWiring(nodes: NodeLike[], edges: EdgeLike[]): Issue[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const issues: Issue[] = [];
  const uses = new Map<string, { end: End; edgeIds: string[] }>();

  for (const edge of edges) {
    const a = endOf(byId.get(edge.source), edge.sourceHandle);
    const b = endOf(byId.get(edge.target), edge.targetHandle);
    if (!a || !b) continue;
    for (const found of checkWire(a, b)) issues.push({ ...found, edgeId: edge.id });
    for (const e of [a, b]) {
      const key = `${e.node.id}|${e.pin.id}`;
      const entry = uses.get(key) ?? { end: e, edgeIds: [] };
      entry.edgeIds.push(edge.id);
      uses.set(key, entry);
    }
  }

  // One signal pin driving several wires is usually a mistake (supply, ground and bus pins may be shared).
  for (const { end, edgeIds } of uses.values()) {
    const shared = end.pin.kind === "io" || end.pin.kind === "analog" || end.pin.kind === "control" || end.pin.kind === "relay";
    if (shared && edgeIds.length > 1) {
      for (const edgeId of edgeIds) {
        issues.push({ severity: "warning", edgeId, message: `${pinTitle(end.def, end.pin, end.node)}: ต่อสายซ้อนกัน ${edgeIds.length} เส้น` });
      }
    }
  }

  return issues;
}
