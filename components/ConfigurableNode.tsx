// components/ConfigurableNode.tsx
'use client';

import { Handle, Position, useReactFlow, NodeProps } from '@xyflow/react';
import { Settings, Plus, X } from 'lucide-react';
import FlippableWrapper from './FlippableWrapper';

interface PinConfig {
  id: string;
  name: string;
  position: 'Left' | 'Right';
  top: number;
  color: string;
}

export default function ConfigurableNode({ id, data, selected }: NodeProps) {
  const { setNodes } = useReactFlow();

  const width = (data.width as number) || 200;
  const height = (data.height as number) || 150;
  const pins = (data.pins as PinConfig[]) || [];

  const updateNode = (updater: (currentData: Record<string, unknown>) => Record<string, unknown>) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === id) {
          return { ...n, data: updater(n.data as Record<string, unknown>) };
        }
        return n;
      })
    );
  };

  const addNewPin = () => {
    const newPin: PinConfig = {
      id: `pin_${Date.now()}`,
      name: `IO_${pins.length + 1}`,
      position: 'Right',
      top: Math.min(height - 20, 30 + pins.length * 25),
      color: '#34d399',
    };
    updateNode((current) => ({ ...current, pins: [...((current.pins as PinConfig[]) || []), newPin] }));
  };

  const updatePin = (pinId: string, field: keyof PinConfig, value: string | number) => {
    updateNode((current) => ({
      ...current,
      pins: (current.pins as PinConfig[]).map((p: PinConfig) => p.id === pinId ? { ...p, [field]: value } : p)
    }));
  };

  const removePin = (pinId: string) => {
    updateNode((current) => ({
      ...current,
      pins: (current.pins as PinConfig[]).filter((p) => p.id !== pinId)
    }));
  };

  return (
    <FlippableWrapper id={id} selected={!!selected} width={width} height={height}>
      {(isFlipped, isEditing) => (
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>

          <div
            className="w-full h-full bg-slate-800 border border-slate-600 rounded-lg shadow-lg flex flex-col overflow-hidden relative"
            style={{ transform: isFlipped ? 'scaleX(-1)' : 'none', transition: 'transform 0.2s ease' }}
          >
            <div
              className="px-3 py-1.5 border-b border-slate-700 bg-slate-900/60 text-center text-[11px] font-semibold text-amber-400 truncate"
              style={{ transform: isFlipped ? 'scaleX(-1)' : 'none' }}
            >
              {(data.label as string) || 'Custom Controller'}
            </div>

            <div className="relative flex-1" style={{ transform: isFlipped ? 'scaleX(-1)' : 'none' }}>
              {pins.map((p) => (
                <div
                  key={p.id}
                  className="absolute flex items-center gap-1.5 text-[11px] text-slate-200"
                  style={{
                    top: `${p.top}px`,
                    left: p.position === 'Left' ? '10px' : 'auto',
                    right: p.position === 'Right' ? '10px' : 'auto',
                  }}
                >
                  {p.position === 'Left' && (
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
                  )}
                  <span>{p.name}</span>
                  {p.position === 'Right' && (
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {isEditing && (
            <div
              className="absolute top-0 w-[280px] bg-white border border-gray-200 rounded-xl shadow-xl p-4 z-[5000]"
              style={{ left: `${width + 16}px` }}
            >
              <h4 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 mb-3">
                <Settings className="w-4 h-4 text-orange-600" />
                Board Configuration
              </h4>

              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-gray-500">Device name</label>
                  <input
                    type="text"
                    value={(data.label as string) || ''}
                    onChange={(e) => updateNode((curr) => ({ ...curr, label: e.target.value }))}
                    className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-orange-500 focus:ring-orange-500 outline-none"
                  />
                </div>

                <div className="flex gap-2">
                  <div className="flex flex-col gap-1 flex-1">
                    <label className="text-[11px] font-medium text-gray-500">Width (px)</label>
                    <input
                      type="number"
                      value={width}
                      onChange={(e) => updateNode((curr) => ({ ...curr, width: Number(e.target.value) }))}
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-orange-500 focus:ring-orange-500 outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1 flex-1">
                    <label className="text-[11px] font-medium text-gray-500">Height (px)</label>
                    <input
                      type="number"
                      value={height}
                      onChange={(e) => updateNode((curr) => ({ ...curr, height: Number(e.target.value) }))}
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-orange-500 focus:ring-orange-500 outline-none"
                    />
                  </div>
                </div>

                <hr className="border-gray-100" />

                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-gray-500">Pins ({pins.length})</span>
                  <button
                    onClick={addNewPin}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-orange-600 text-white text-[11px] font-medium hover:bg-orange-700"
                  >
                    <Plus className="w-3 h-3" />
                    Add Pin
                  </button>
                </div>

                <div className="max-h-[180px] overflow-y-auto bg-gray-50 rounded-md p-1.5 space-y-1.5">
                  {pins.length === 0 && (
                    <div className="text-center py-3 text-[11px] text-gray-400">No pins yet</div>
                  )}
                  {pins.map((p) => (
                    <div key={p.id} className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-md p-1.5">
                      <input
                        type="text"
                        value={p.name}
                        onChange={(e) => updatePin(p.id, 'name', e.target.value)}
                        className="w-14 rounded border border-gray-300 px-1.5 py-0.5 text-[11px] focus:border-orange-500 focus:ring-orange-500 outline-none"
                      />
                      <select
                        value={p.position}
                        onChange={(e) => updatePin(p.id, 'position', e.target.value as 'Left' | 'Right')}
                        className="rounded border border-gray-300 px-1 py-0.5 text-[11px] focus:border-orange-500 focus:ring-orange-500 outline-none"
                      >
                        <option value="Left">Left</option>
                        <option value="Right">Right</option>
                      </select>
                      <input
                        type="number"
                        value={p.top}
                        onChange={(e) => updatePin(p.id, 'top', Number(e.target.value))}
                        className="w-12 rounded border border-gray-300 px-1.5 py-0.5 text-[11px] focus:border-orange-500 focus:ring-orange-500 outline-none"
                      />
                      <button onClick={() => removePin(p.id)} className="text-gray-400 hover:text-red-600 ml-auto">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {pins.map((p) => {
            const isLeft = p.position === 'Left';
            const finalPosition = isFlipped
              ? (isLeft ? Position.Right : Position.Left)
              : (isLeft ? Position.Left : Position.Right);

            return (
              <Handle
                key={p.id}
                type="source"
                position={finalPosition}
                id={p.id}
                style={{
                  background: p.color,
                  width: 12,
                  height: 12,
                  border: '2px solid #fff',
                  boxShadow: '0 0 0 1px rgba(15, 23, 42, 0.4)',
                  top: `${p.top + 12 + 10 + 6}px`,
                  [isFlipped ? (isLeft ? 'right' : 'left') : (isLeft ? 'left' : 'right')]: '-6px'
                }}
              />
            );
          })}
        </div>
      )}
    </FlippableWrapper>
  );
}
