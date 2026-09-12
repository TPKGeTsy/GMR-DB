'use client';

import { useState } from 'react';
import { NodeProps, NodeToolbar, Position, useReactFlow } from '@xyflow/react';
import { Trash2 } from 'lucide-react';

export default function TextNode({ id, data, selected }: NodeProps) {
  const { setNodes, deleteElements } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const text = (data.text as string) || 'Double-click to edit';

  const updateText = (value: string) => {
    setNodes((nds) =>
      nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, text: value } } : n))
    );
  };

  const onDelete = () => deleteElements({ nodes: [{ id }] });

  return (
    <div className="relative">
      <NodeToolbar
        isVisible={selected && !editing}
        position={Position.Top}
        className="flex gap-1.5 bg-white p-1.5 rounded-lg border border-gray-200 shadow-lg"
      >
        <button
          onClick={onDelete}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
        >
          <Trash2 className="w-3 h-3" />
          Delete
        </button>
      </NodeToolbar>

      {editing ? (
        <textarea
          autoFocus
          defaultValue={text}
          onBlur={(e) => {
            updateText(e.target.value);
            setEditing(false);
          }}
          className="nodrag min-w-[140px] min-h-[36px] bg-yellow-50 border-2 border-orange-400 rounded px-2 py-1 text-sm text-gray-900 outline-none resize"
        />
      ) : (
        <div
          onDoubleClick={() => setEditing(true)}
          className={`min-w-[60px] px-2 py-1 text-sm font-medium text-gray-800 whitespace-pre-wrap cursor-text rounded ${
            selected ? 'ring-2 ring-orange-400 bg-yellow-50/60' : 'hover:bg-yellow-50/40'
          }`}
        >
          {text}
        </div>
      )}
    </div>
  );
}
