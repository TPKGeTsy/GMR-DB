'use client';

import {
  EdgeLabelRenderer,
  useReactFlow,
  EdgeProps,
} from '@xyflow/react';
import { useState, MouseEvent } from 'react';
import { Trash2 } from 'lucide-react';

export default function EditableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style = {},
  markerEnd,
  selected
}: EdgeProps) {
  const { setEdges, deleteElements } = useReactFlow();
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const defaultLabelX = sourceX + (targetX - sourceX) / 2;
  const defaultLabelY = sourceY + (targetY - sourceY) / 2;
  const buttonX = defaultLabelX + offsetX;
  const buttonY = defaultLabelY + offsetY;

  const edgePath = `M ${sourceX} ${sourceY} L ${buttonX} ${sourceY} L ${buttonX} ${buttonY} L ${targetX} ${buttonY} L ${targetX} ${targetY}`;

  const changeColor = (color: string) => {
    setEdges((eds) => eds.map((e) => e.id === id ? { ...e, style: { ...e.style, stroke: color } } : e));
  };

  const onDelete = () => deleteElements({ edges: [{ id }] });

  const handleMouseDown = (event: MouseEvent) => {
    event.stopPropagation();
    setIsDragging(true);

    const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
      setOffsetX((prev) => prev + moveEvent.movementX);
      setOffsetY((prev) => prev + moveEvent.movementY);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <>
      <path
        id={id}
        style={{
          ...style,
          strokeWidth: isDragging || selected ? 4 : (style?.strokeWidth || 3),
          stroke: selected ? '#f59e0b' : (style?.stroke || '#22c55e')
        }}
        className="react-flow__edge-path"
        d={edgePath}
        markerEnd={markerEnd}
      />

      <EdgeLabelRenderer>
        <div style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${buttonX}px,${buttonY}px)`, pointerEvents: 'all', zIndex: 1000 }}>

          {selected && (
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-white px-2 py-1.5 rounded-full border border-gray-200 shadow-lg">
              <button
                onClick={() => changeColor('#ef4444')}
                className="w-4 h-4 rounded-full bg-red-500 hover:ring-2 hover:ring-offset-1 hover:ring-red-500 transition-shadow"
                title="VCC (red)"
              />
              <button
                onClick={() => changeColor('#1f2937')}
                className="w-4 h-4 rounded-full bg-gray-800 hover:ring-2 hover:ring-offset-1 hover:ring-gray-800 transition-shadow"
                title="GND (black)"
              />
              <button
                onClick={() => changeColor('#3b82f6')}
                className="w-4 h-4 rounded-full bg-blue-500 hover:ring-2 hover:ring-offset-1 hover:ring-blue-500 transition-shadow"
                title="Signal (blue)"
              />
              <div className="w-px h-4 bg-gray-200 mx-0.5" />
              <button
                onClick={onDelete}
                className="w-5 h-5 flex items-center justify-center rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                title="Delete wire"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          )}

          <div
            onMouseDown={handleMouseDown}
            className="w-3.5 h-3.5 rounded-full bg-white shadow-md cursor-move"
            style={{ border: `2px solid ${isDragging ? '#f59e0b' : (style?.stroke as string) || '#22c55e'}` }}
          />
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
