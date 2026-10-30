// Reads a 2D DXF flat pattern (sheet-metal part): size, holes / slots / cut-outs,
// bend lines, and a suggested cutting order. Only what such files contain is
// handled: LINE, ARC, CIRCLE and LWPOLYLINE in the ENTITIES section.

export type Pt = [number, number];

export interface DxfFeature {
  kind: "hole" | "slot" | "rect" | "cutout";
  /** Human size, e.g. "Ø4", "4 × 8", "5.2 × 1.4". */
  size: string;
  center: Pt;
  width: number;
  height: number;
}

export interface CutStep {
  step: number;
  kind: "hole" | "slot" | "rect" | "cutout" | "outline" | "bend";
  label: string;
  /** Where the step happens (features only) - used to number them on the drawing. */
  at?: Pt;
}

export interface DxfAnalysis {
  /** Overall size of the outer contour (mm). */
  width: number;
  height: number;
  area: number;
  features: DxfFeature[];
  bendCount: number;
  steps: CutStep[];
  /** Polylines for drawing: closed loops (outer first) and bend lines. */
  geometry: { loops: Pt[][]; bends: [Pt, Pt][] };
  units: "mm" | "inch";
}

interface Seg {
  type: "line" | "arc";
  a: Pt;
  b: Pt;
  /** Arc only. */
  center?: Pt;
  radius?: number;
  start?: number;
  end?: number;
  linetype: string;
}

const TOL = 0.05;
const ARC_STEP_DEG = 12;

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const key = (p: Pt) => `${Math.round(p[0] / TOL)}|${Math.round(p[1] / TOL)}`;
const same = (p: Pt, q: Pt) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= TOL * 1.5;

function arcPoints(center: Pt, r: number, startDeg: number, endDeg: number): Pt[] {
  let end = endDeg;
  while (end <= startDeg) end += 360;
  const n = Math.max(2, Math.ceil((end - startDeg) / ARC_STEP_DEG));
  const angles: number[] = [];
  for (let i = 0; i <= n; i++) angles.push(startDeg + ((end - startDeg) * i) / n);
  // Keep the top / bottom / left / right extremes so sizes measure exactly.
  for (let q = Math.ceil(startDeg / 90) * 90; q < end; q += 90) if (q > startDeg) angles.push(q);
  angles.sort((x, y) => x - y);
  return angles.map((deg): Pt => {
    const a = (deg * Math.PI) / 180;
    return [center[0] + r * Math.cos(a), center[1] + r * Math.sin(a)];
  });
}

function polygonArea(pts: Pt[]): number {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

function bbox(pts: Pt[]) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/** DXF is "code line / value line" pairs. */
function readPairs(text: string): [number, string][] {
  const lines = text.split(/\r?\n/);
  const pairs: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i].trim());
    if (Number.isFinite(code)) pairs.push([code, lines[i + 1].trim()]);
  }
  return pairs;
}

interface RawEntity {
  type: string;
  data: [number, string][];
}

function readEntities(pairs: [number, string][]): { entities: RawEntity[]; insUnits: number } {
  let insUnits = 0;
  for (let i = 0; i < pairs.length - 1; i++) {
    if (pairs[i][0] === 9 && pairs[i][1] === "$INSUNITS") insUnits = Number(pairs[i + 1][1]) || 0;
  }
  const entities: RawEntity[] = [];
  let inEntities = false;
  let current: RawEntity | null = null;
  for (let i = 0; i < pairs.length; i++) {
    const [code, value] = pairs[i];
    if (code === 0 && value === "SECTION") {
      inEntities = pairs[i + 1]?.[0] === 2 && pairs[i + 1][1] === "ENTITIES";
      current = null;
      continue;
    }
    if (!inEntities) continue;
    if (code === 0) {
      if (value === "ENDSEC") {
        inEntities = false;
        current = null;
        continue;
      }
      current = { type: value, data: [] };
      entities.push(current);
    } else if (current) {
      current.data.push([code, value]);
    }
  }
  return { entities, insUnits };
}

const num = (e: RawEntity, code: number, fallback = NaN) => {
  const v = e.data.find(([c]) => c === code);
  return v ? Number(v[1]) : fallback;
};
const str = (e: RawEntity, code: number) => e.data.find(([c]) => c === code)?.[1] ?? "";

/** LWPOLYLINE vertices with bulges -> line / arc segments. */
function polylineSegments(e: RawEntity): { segs: Seg[]; closed: boolean } {
  const verts: { p: Pt; bulge: number }[] = [];
  for (const [code, value] of e.data) {
    if (code === 10) verts.push({ p: [Number(value), 0], bulge: 0 });
    else if (code === 20 && verts.length > 0) verts[verts.length - 1].p[1] = Number(value);
    else if (code === 42 && verts.length > 0) verts[verts.length - 1].bulge = Number(value);
  }
  const closed = (num(e, 70, 0) & 1) === 1;
  const linetype = str(e, 6);
  const segs: Seg[] = [];
  const count = closed ? verts.length : verts.length - 1;
  for (let i = 0; i < count; i++) {
    const v1 = verts[i];
    const v2 = verts[(i + 1) % verts.length];
    if (!v1.bulge) {
      segs.push({ type: "line", a: v1.p, b: v2.p, linetype });
      continue;
    }
    // Bulge = tan(angle / 4); convert to a centre-radius arc.
    const theta = 4 * Math.atan(v1.bulge);
    const chord = Math.hypot(v2.p[0] - v1.p[0], v2.p[1] - v1.p[1]);
    const radius = Math.abs(chord / (2 * Math.sin(theta / 2)));
    const mid: Pt = [(v1.p[0] + v2.p[0]) / 2, (v1.p[1] + v2.p[1]) / 2];
    const h = Math.sqrt(Math.max(0, radius * radius - (chord / 2) ** 2));
    const dir: Pt = [(v2.p[0] - v1.p[0]) / chord, (v2.p[1] - v1.p[1]) / chord];
    const sign = v1.bulge > 0 ? 1 : -1;
    const sizeSign = Math.abs(theta) > Math.PI ? -1 : 1;
    const center: Pt = [mid[0] - dir[1] * h * sign * sizeSign, mid[1] + dir[0] * h * sign * sizeSign];
    const angleOf = (p: Pt) => (Math.atan2(p[1] - center[1], p[0] - center[0]) * 180) / Math.PI;
    const ccw = v1.bulge > 0;
    segs.push({
      type: "arc",
      a: v1.p,
      b: v2.p,
      center,
      radius,
      start: ccw ? angleOf(v1.p) : angleOf(v2.p),
      end: ccw ? angleOf(v2.p) : angleOf(v1.p),
      linetype,
    });
  }
  return { segs, closed };
}

/** Points along a segment from its start `from` to its other end. */
function segPoints(s: Seg, from: Pt): Pt[] {
  const forward = same(s.a, from);
  if (s.type === "line") return forward ? [s.a, s.b] : [s.b, s.a];
  const pts = arcPoints(s.center!, s.radius!, s.start!, s.end!);
  // pts run from the arc's start angle (point a) to its end angle (point b).
  const startsAtA = same(pts[0], s.a) || !same(pts[0], s.b);
  const ordered = startsAtA ? pts : [...pts].reverse();
  return forward ? ordered : [...ordered].reverse();
}

function classify(loop: Pt[], arcCount: number, lineCount: number, circleRadius?: number): DxfFeature {
  const b = bbox(loop);
  const w = round(b.maxX - b.minX);
  const h = round(b.maxY - b.minY);
  const center: Pt = [round((b.minX + b.maxX) / 2), round((b.minY + b.maxY) / 2)];
  if (circleRadius !== undefined || (arcCount >= 2 && lineCount === 0 && Math.abs(w - h) < 0.1)) {
    const d = round(circleRadius !== undefined ? circleRadius * 2 : w);
    return { kind: "hole", size: `Ø${d}`, center, width: d, height: d };
  }
  if (arcCount === 2 && lineCount === 2) {
    const [a, c] = w <= h ? [w, h] : [h, w];
    return { kind: "slot", size: `${a} × ${c}`, center, width: w, height: h };
  }
  if (arcCount === 0 && lineCount === 4) return { kind: "rect", size: `${w} × ${h}`, center, width: w, height: h };
  return { kind: "cutout", size: `${w} × ${h}`, center, width: w, height: h };
}

const KIND_LABEL: Record<CutStep["kind"], string> = {
  hole: "เจาะรู",
  slot: "ตัดช่องยาวมน",
  rect: "ตัดช่องสี่เหลี่ยม",
  cutout: "ตัดช่อง",
  outline: "ตัดเส้นรอบนอก",
  bend: "พับ",
};

/** Inner features first (always nearest next, starting from the lower-left
 *  corner so the cutter travels the shortest way), then the outline, then the bends. */
function buildSteps(features: DxfFeature[], bends: [Pt, Pt][], outer: Pt[]): CutStep[] {
  const b = bbox(outer);
  let at: Pt = [b.minX, b.minY];
  const left = [...features];
  const steps: CutStep[] = [];
  while (left.length > 0) {
    let best = 0;
    for (let i = 1; i < left.length; i++) {
      if (Math.hypot(left[i].center[0] - at[0], left[i].center[1] - at[1]) < Math.hypot(left[best].center[0] - at[0], left[best].center[1] - at[1])) best = i;
    }
    const f = left.splice(best, 1)[0];
    at = f.center;
    steps.push({ step: steps.length + 1, kind: f.kind, label: `${KIND_LABEL[f.kind]} ${f.size} ที่ (${f.center[0]}, ${f.center[1]})`, at: f.center });
  }
  steps.push({ step: steps.length + 1, kind: "outline", label: `${KIND_LABEL.outline} ${round(b.maxX - b.minX)} × ${round(b.maxY - b.minY)} มม.` });
  // Bends from the one closest to the origin outward.
  [...bends]
    .sort((p, q) => Math.min(p[0][0], p[1][0]) - Math.min(q[0][0], q[1][0]) || Math.min(p[0][1], p[1][1]) - Math.min(q[0][1], q[1][1]))
    .forEach((seg, i) => {
      const horizontal = Math.abs(seg[0][1] - seg[1][1]) < Math.abs(seg[0][0] - seg[1][0]);
      steps.push({
        step: steps.length + 1,
        kind: "bend",
        label: `${KIND_LABEL.bend}ที่เส้นพับ ${i + 1} (${horizontal ? `แนวนอน y=${round(seg[0][1])}` : `แนวตั้ง x=${round(seg[0][0])}`})`,
      });
    });
  return steps;
}

/** Returns null when the file has no closed outline (not a flat pattern). */
export function analyzeDxf(text: string): DxfAnalysis | null {
  const { entities, insUnits } = readEntities(readPairs(text));
  const scale = insUnits === 1 ? 25.4 : 1; // inches -> mm
  const sc = (p: Pt): Pt => [p[0] * scale, p[1] * scale];

  const segs: Seg[] = [];
  const loops: { pts: Pt[]; arcs: number; lines: number; circleRadius?: number }[] = [];

  for (const e of entities) {
    const linetype = str(e, 6).toUpperCase();
    if (e.type === "LINE") {
      segs.push({ type: "line", a: sc([num(e, 10), num(e, 20)]), b: sc([num(e, 11), num(e, 21)]), linetype });
    } else if (e.type === "ARC") {
      const center = sc([num(e, 10), num(e, 20)]);
      const radius = num(e, 40) * scale;
      const start = num(e, 50);
      const end = num(e, 51);
      const pts = arcPoints(center, radius, start, end);
      segs.push({ type: "arc", a: pts[0], b: pts[pts.length - 1], center, radius, start, end, linetype });
    } else if (e.type === "CIRCLE") {
      const center = sc([num(e, 10), num(e, 20)]);
      const radius = num(e, 40) * scale;
      loops.push({ pts: arcPoints(center, radius, 0, 360), arcs: 0, lines: 0, circleRadius: radius });
    } else if (e.type === "LWPOLYLINE") {
      const poly = polylineSegments(e);
      for (const s of poly.segs) {
        s.a = sc(s.a);
        s.b = sc(s.b);
        if (s.center) {
          s.center = sc(s.center);
          s.radius = s.radius! * scale;
        }
        segs.push(s);
      }
    }
  }

  // Join end points into closed chains; whatever stays open is a bend / helper line.
  const byEnd = new Map<string, number[]>();
  segs.forEach((s, i) => {
    for (const p of [s.a, s.b]) {
      const k = key(p);
      byEnd.set(k, [...(byEnd.get(k) ?? []), i]);
    }
  });
  const used = new Set<number>();
  const openSegs: Seg[] = [];
  for (let i = 0; i < segs.length; i++) {
    if (used.has(i)) continue;
    const chain: number[] = [i];
    const visited = new Set<number>([i]);
    let pts: Pt[] = segPoints(segs[i], segs[i].a);
    let tail = pts[pts.length - 1];
    const startPt = pts[0];
    let closed = same(tail, startPt);
    while (!closed) {
      const next = (byEnd.get(key(tail)) ?? []).find((j) => !visited.has(j) && !used.has(j));
      if (next === undefined) break;
      visited.add(next);
      chain.push(next);
      pts = [...pts, ...segPoints(segs[next], tail).slice(1)];
      tail = pts[pts.length - 1];
      closed = same(tail, startPt);
    }
    if (closed && chain.length >= 2) {
      chain.forEach((j) => used.add(j));
      loops.push({
        pts: pts.slice(0, -1),
        arcs: chain.filter((j) => segs[j].type === "arc").length,
        lines: chain.filter((j) => segs[j].type === "line").length,
      });
    }
  }
  segs.forEach((s, i) => {
    if (!used.has(i)) openSegs.push(s);
  });

  if (loops.length === 0) return null;
  const ranked = [...loops].sort((p, q) => polygonArea(q.pts) - polygonArea(p.pts));
  const outer = ranked[0];
  const inner = ranked.slice(1);
  const ob = bbox(outer.pts);

  const features = inner.map((l) => classify(l.pts, l.arcs, l.lines, l.circleRadius));
  const bends = openSegs.filter((s) => s.type === "line" && s.linetype.includes("HIDDEN")).map((s): [Pt, Pt] => [s.a, s.b]);

  return {
    width: round(ob.maxX - ob.minX),
    height: round(ob.maxY - ob.minY),
    area: round(polygonArea(outer.pts), 1),
    features,
    bendCount: bends.length,
    steps: buildSteps(features, bends, outer.pts),
    geometry: {
      loops: ranked.map((l) => l.pts.map((p): Pt => [round(p[0]), round(p[1])])),
      bends: bends.map(([a, b]): [Pt, Pt] => [
        [round(a[0]), round(a[1])],
        [round(b[0]), round(b[1])],
      ]),
    },
    units: insUnits === 1 ? "inch" : "mm",
  };
}

/** The name of the part and how many to make, from the file name. The name ends with "...PCS" where
 *  ... is the number of pieces: "TP-A_1_4PCS.DXF" = 4 of "TP-A". Also read: "4 PCS", "4pcs", "x4PCS", "(4PCS)".
 *  CAD exports write an index before the count ("_1_4PCS"): that index is dropped from the name.
 *  No "PCS" at the end = 1 piece. */
export function readDxfFileName(fileName: string): { name: string; quantity: number } {
  const base = fileName.replace(/\.[^.]+$/, "").trim();
  const match = /^(.*?)[\s_\-(×x]*(\d+)\s*PCS?\)?\s*$/i.exec(base);
  if (!match) return { name: base.replace(/_/g, " ").replace(/\s+/g, " ").trim() || base, quantity: 1 };
  const quantity = Math.min(10000, Math.max(1, Number(match[2])));
  // "..._1" before the count is the exporter's index (name_index_countPCS), not part of the name.
  const name = match[1]
    .replace(/_\d+$/, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { name: name || base, quantity };
}
