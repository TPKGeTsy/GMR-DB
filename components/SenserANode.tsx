'use client';

import { Handle, Position } from '@xyflow/react';
import FlippableWrapper from './FlippableWrapper';

interface SenserANodeProps {
  id: string;
  data: {
    label?: string;
  };
  selected: boolean;
}

const handleStyle = (color: string) => ({
  background: color,
  width: 12,
  height: 12,
  border: '2px solid #fff',
  boxShadow: '0 0 0 1px rgba(15, 23, 42, 0.4)',
});

export default function SenserANode({ id, data, selected }: SenserANodeProps) {
  return (
    <FlippableWrapper id={id} selected={selected} width={180} height={130}>
      {(isFlipped) => (
        <div
          className="w-full h-full bg-sky-800 border border-sky-600 rounded-lg shadow-lg flex flex-col overflow-hidden"
          style={{ transform: isFlipped ? 'scaleX(-1)' : 'none', transition: 'transform 0.2s ease' }}
        >
          <div
            className="px-3 py-1.5 border-b border-sky-700 bg-sky-900/50 text-center text-[11px] font-semibold text-emerald-300 truncate"
            style={{ transform: isFlipped ? 'scaleX(-1)' : 'none' }}
          >
            {data.label || 'Sensor A'}
          </div>

          <div
            className="flex-1 flex flex-col justify-center gap-3.5 px-3 py-2"
            style={{ transform: isFlipped ? 'scaleX(-1)' : 'none' }}
          >
            <div className="flex items-center justify-between text-[11px] text-sky-50">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                3V3
              </span>
              <span className="flex items-center gap-1.5">
                S01
                <span className="w-2 h-2 rounded-full bg-emerald-300 flex-shrink-0" />
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-sky-50">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-300 flex-shrink-0" />
                GND
              </span>
              <span className="flex items-center gap-1.5">
                S02
                <span className="w-2 h-2 rounded-full bg-emerald-300 flex-shrink-0" />
              </span>
            </div>
          </div>

          <Handle type="source" position={isFlipped ? Position.Right : Position.Left} id="sensorA_3v3" style={{ ...handleStyle('#ef4444'), top: 48 }} />
          <Handle type="source" position={isFlipped ? Position.Right : Position.Left} id="sensorA_gnd" style={{ ...handleStyle('#cbd5e1'), top: 79 }} />
          <Handle type="source" position={isFlipped ? Position.Left : Position.Right} id="signalA_1" style={{ ...handleStyle('#34d399'), top: 48 }} />
          <Handle type="source" position={isFlipped ? Position.Left : Position.Right} id="signalA_2" style={{ ...handleStyle('#34d399'), top: 79 }} />
        </div>
      )}
    </FlippableWrapper>
  );
}
