// src/app/circuit/components/FlippableWrapper.tsx
'use client';

import { useState, ReactNode } from 'react';
import { NodeToolbar, Position, useReactFlow } from '@xyflow/react';
import { Pencil, Check, RotateCw, Trash2 } from 'lucide-react';

interface FlippableWrapperProps {
  id: string;
  selected: boolean;
  width: number;
  height: number;
  children: (isFlipped: boolean, isEditing: boolean) => ReactNode;
}

export default function FlippableWrapper({ id, selected, width, height, children }: FlippableWrapperProps) {
  const { deleteElements } = useReactFlow();
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);

  const toggleFlip = () => setIsFlipped(!isFlipped);
  const toggleEdit = () => setIsEditing(!isEditing);
  const onDelete = () => deleteElements({ nodes: [{ id }] });

  return (
    <>
      <NodeToolbar
        isVisible={selected}
        position={Position.Top}
        className="flex gap-1.5 bg-white p-1.5 rounded-lg border border-gray-200 shadow-lg"
      >
        <button
          onClick={toggleEdit}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
            isEditing ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {isEditing ? <Check className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
          {isEditing ? 'Done' : 'Configure'}
        </button>
        <button
          onClick={toggleFlip}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
        >
          <RotateCw className="w-3 h-3" />
          Flip
        </button>
        <button
          onClick={onDelete}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
        >
          <Trash2 className="w-3 h-3" />
          Delete
        </button>
      </NodeToolbar>

      <div style={{ position: 'relative', width: `${width}px`, height: `${height}px` }}>
        {children(isFlipped, isEditing)}
      </div>
    </>
  );
}
