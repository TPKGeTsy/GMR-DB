"use client";

import { moduleOfChannel, type ChannelMap, type ModuleStatus } from "@/lib/relayState";
import { ZONE_BY_ID, type FloorMap } from "@/lib/zones";
import { PersonGlyph } from "./PersonIcon";

interface ZoneMapProps {
  map: FloorMap;
  /** Output states by global channel, or null while still loading. */
  states: boolean[] | null;
  /** Channel currently being switched, if any. */
  busyChannel: number | null;
  onToggle: (channel: number) => void;
  /** Per-module availability; zones on a module that isn't online can't be switched. */
  modules: ModuleStatus[] | null;
  /** Which module each channel is wired to (default wiring when omitted). */
  channelMap?: ChannelMap | null;
}

export default function ZoneMap({ map, states, busyChannel, onToggle, modules, channelMap }: ZoneMapProps) {
  const disabled = !states || !modules || busyChannel !== null;

  return (
    <svg
      viewBox={map.viewBox}
      className="w-full h-auto rounded-xl border border-gray-200 bg-white"
      role="group"
      aria-label={map.title}
    >
      {/* Clickable zones first so walls draw on top of their edges. */}
      {map.shapes.map((shape) => {
        const zone = ZONE_BY_ID[shape.zoneId];
        if (!zone) return null;
        // A zone with no channel yet is shown but can never be switched.
        const channel = zone.channel;
        const unassigned = channel === null;
        const on = !unassigned && (states?.[channel] ?? false);
        const busy = !unassigned && busyChannel === channel;
        // A zone on a module that isn't answering (or isn't installed yet) shows
        // what we know but can't be switched.
        const moduleIndex = unassigned ? -1 : moduleOfChannel(channel, channelMap ?? undefined);
        const moduleStatus = modules?.[moduleIndex];
        const moduleDown = !unassigned && !!modules && !moduleStatus?.online;
        const notInstalled = moduleDown && !moduleStatus?.configured;
        const zoneDisabled = disabled || unassigned || moduleDown;
        const activate = () => {
          if (!zoneDisabled && !unassigned) onToggle(channel);
        };
        // Icon zones (the small restrooms) are narrow: keep their caption short.
        const compact = !!zone.icon;
        const subLabel = unassigned
          ? "ยังไม่มีช่อง"
          : notInstalled
            ? compact
              ? "ยังไม่ตั้งค่า"
              : `โมดูล ${moduleIndex + 1} ยังไม่ตั้งค่า`
            : moduleDown
              ? compact
                ? "ไม่ตอบ"
                : `โมดูล ${moduleIndex + 1} ไม่ตอบ`
              : `${!states ? "…" : on ? "ON" : "OFF"} · CH${channel + 1}`;

        return (
          <g key={shape.zoneId}>
            <polygon
              points={shape.points}
              role="button"
              tabIndex={zoneDisabled ? -1 : 0}
              aria-pressed={on}
              aria-label={
                unassigned
                  ? `${zone.label} (ยังไม่มีช่อง)`
                  : `${zone.label} (ช่อง ${channel + 1}) ${on ? "เปิดอยู่" : "ปิดอยู่"}`
              }
              aria-disabled={zoneDisabled}
              onClick={activate}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  activate();
                }
              }}
              className={`stroke-gray-400 transition-colors focus:outline-none focus-visible:stroke-orange-500 ${
                unassigned || notInstalled ? "fill-gray-200" : on ? "fill-yellow-300" : "fill-gray-100"
              } ${moduleDown && !notInstalled ? "opacity-70" : ""} ${
                zoneDisabled ? "cursor-not-allowed" : "cursor-pointer hover:fill-orange-200"
              } ${busy ? "animate-pulse" : ""}`}
              strokeWidth={2}
            />
            {zone.icon && shape.iconAt ? (
              <g
                transform={`translate(${shape.iconAt[0]} ${shape.iconAt[1]}) scale(${shape.iconScale ?? 1})`}
                className={`pointer-events-none ${unassigned || notInstalled ? "opacity-40" : ""}`}
              >
                <title>{zone.label}</title>
                <PersonGlyph kind={zone.icon} />
              </g>
            ) : (
              <text
                x={shape.labelAt[0]}
                y={shape.labelAt[1]}
                textAnchor="middle"
                className={`pointer-events-none select-none ${
                  unassigned || notInstalled ? "fill-gray-500" : "fill-gray-800"
                }`}
                fontSize={shape.labelSize ?? 26}
                fontWeight={600}
              >
                {zone.label}
              </text>
            )}
            <text
              x={shape.labelAt[0]}
              y={zone.icon ? shape.labelAt[1] : shape.labelAt[1] + 22}
              textAnchor="middle"
              className="pointer-events-none select-none fill-gray-500"
              fontSize={15}
            >
              {subLabel}
            </text>
          </g>
        );
      })}

      {map.stairs && <Stairs rect={map.stairs} />}

      {map.texts?.map((t, i) => (
        <text
          key={i}
          x={t.at[0]}
          y={t.at[1]}
          textAnchor="middle"
          className="pointer-events-none select-none fill-gray-600"
          fontSize={t.size ?? 30}
          fontWeight={600}
        >
          {t.text}
        </text>
      ))}

      {map.thin && (
        <g className="pointer-events-none" fill="none" stroke="#6b7280" strokeWidth={2}>
          {map.thin.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
      )}

      <g className="pointer-events-none" fill="none" stroke="#111827" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round">
        {map.walls.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}

function Stairs({ rect: [x, y, w, h] }: { rect: [number, number, number, number] }) {
  const steps = 12;
  return (
    <g className="pointer-events-none" stroke="#111827" strokeWidth={2} fill="none">
      <rect x={x} y={y} width={w} height={h} />
      {Array.from({ length: steps - 1 }, (_, i) => {
        const ly = y + ((i + 1) * h) / steps;
        return <line key={i} x1={x} y1={ly} x2={x + w} y2={ly} />;
      })}
    </g>
  );
}
