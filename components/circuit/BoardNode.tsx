"use client";

import { Handle, NodeToolbar, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { Trash2, TriangleAlert } from "lucide-react";
import { getComponent, symbolRows } from "@/lib/circuit/library";
import { KIND_COLORS, type ComponentDef, type Pin } from "@/lib/circuit/types";

const HEADER_H = 44;
const ROW_H = 24;
const FOOT_PAD = 8;
const CHAR_W = 6.8;

/** Wide enough for the longest name on each side, never narrower than a readable card. */
export function symbolSize(def: ComponentDef): { width: number; height: number } {
  const sideWidth = (side: Pin["side"]) =>
    Math.max(0, ...def.pins.filter((p) => p.side === side).map((p) => p.name.length * CHAR_W + (p.number ? p.number.length * 5.5 + 10 : 0) + 36));
  const width = Math.max(190, Math.ceil(sideWidth("left") + sideWidth("right") + 28), Math.ceil(def.name.length * 7.6 + 24));
  return { width, height: HEADER_H + symbolRows(def) * ROW_H + FOOT_PAD };
}

function pinTitle(p: Pin): string {
  const parts = [p.name];
  if (p.number) parts.push(`(${p.number})`);
  if (p.voltage !== undefined) parts.push(p.kind === "power" ? `${p.voltage} V` : `ลอจิก ${p.voltage} V`);
  if (p.maxIn !== undefined && p.kind !== "power") parts.push(`รับได้ไม่เกิน ${p.maxIn} V`);
  if (p.functions?.length) parts.push(`· ${p.functions.join(", ")}`);
  if (p.avoid) parts.push(`⚠ ${p.avoid}`);
  return parts.join(" ");
}

/** A part from the library drawn as a schematic symbol: the name in the header, pins down both sides. */
export default function BoardNode({ id, data, selected }: NodeProps) {
  const { setNodes, deleteElements } = useReactFlow();
  const def = getComponent(data.libraryId);
  if (!def) {
    return (
      <div className="rounded border-2 border-dashed border-red-400 bg-red-50 px-3 py-2 text-xs text-red-700">
        ไม่พบอุปกรณ์ &quot;{String(data.libraryId)}&quot; ในไลบรารี
      </div>
    );
  }
  const { width, height } = symbolSize(def);
  const label = typeof data.label === "string" ? data.label : "";
  const left = def.pins.filter((p) => p.side === "left");
  const right = def.pins.filter((p) => p.side === "right");

  const renderSide = (pins: Pin[], side: Pin["side"]) =>
    pins.map((p, i) => {
      const top = HEADER_H + i * ROW_H + ROW_H / 2;
      const isLeft = side === "left";
      return (
        <div key={p.id}>
          <div
            title={pinTitle(p)}
            className={`absolute flex items-center gap-1.5 text-[11px] leading-none text-slate-800 ${isLeft ? "left-3" : "right-3 flex-row-reverse"}`}
            style={{ top: top - 7 }}
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: KIND_COLORS[p.kind] }} />
            <span className="font-medium">{p.name}</span>
            {p.number && <span className="text-[9px] text-slate-400">{p.number}</span>}
            {p.avoid && <TriangleAlert className="h-3 w-3 shrink-0 text-amber-500" aria-label="ควรหลีกเลี่ยง" />}
          </div>
          <Handle
            type="source"
            position={isLeft ? Position.Left : Position.Right}
            id={p.id}
            title={pinTitle(p)}
            style={{
              top,
              width: 11,
              height: 11,
              background: KIND_COLORS[p.kind],
              border: "2px solid #fff",
              boxShadow: "0 0 0 1px rgba(15,23,42,0.5)",
            }}
          />
        </div>
      );
    });

  return (
    <>
      <NodeToolbar isVisible={selected} position={Position.Top} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg">
        <input
          type="text"
          value={label}
          placeholder={`ชื่อ (เช่น ${def.name})`}
          onChange={(e) => setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, label: e.target.value } } : n)))}
          className="w-44 rounded-md border border-gray-300 px-2 py-1 text-xs outline-none focus:border-orange-500"
        />
        <button
          type="button"
          onClick={() => deleteElements({ nodes: [{ id }] })}
          className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-100"
        >
          <Trash2 className="h-3 w-3" />
          ลบ
        </button>
      </NodeToolbar>

      <div
        className={`relative rounded-md border-2 bg-white shadow-md ${selected ? "border-orange-500" : "border-slate-700"}`}
        style={{ width, height }}
      >
        <div className="flex flex-col justify-center rounded-t-[4px] bg-slate-800 px-3 text-white" style={{ height: HEADER_H }}>
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[12px] font-semibold">{label || def.name}</span>
            {!def.verified && (
              <span className="shrink-0 rounded bg-amber-400 px-1 text-[9px] font-bold text-slate-900" title="แม่แบบ — ตรวจชื่อขั้วกับคู่มือรุ่นจริงก่อนใช้">
                แม่แบบ
              </span>
            )}
          </div>
          <span className="truncate text-[9px] text-slate-300">{label ? def.name : (def.maker ?? "")}</span>
        </div>
        {renderSide(left, "left")}
        {renderSide(right, "right")}
      </div>
    </>
  );
}
