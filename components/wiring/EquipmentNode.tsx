"use client";

import { Handle, Position, NodeProps, Node } from "@xyflow/react";
import { memo } from "react";

export type EquipmentNodeData = {
  name: string;
  imageUrl: string;
  pins: {
    id: string;
    name: string;
    type: string;
    xPos: number;
    yPos: number;
  }[];
};

type EquipmentNode = Node<EquipmentNodeData, 'equipment'>;

function EquipmentNode({ data }: NodeProps<EquipmentNode>) {
  return (
    <div className="bg-white border-2 border-orange-200 rounded-lg shadow-lg overflow-hidden min-w-[150px]">
      <div className="bg-orange-600 px-3 py-1 text-white text-[10px] font-bold truncate">
        {data.name}
      </div>
      <div className="relative aspect-square w-full bg-gray-50 flex items-center justify-center">
        <img
          src={data.imageUrl}
          alt={data.name}
          className="max-w-full max-h-full object-contain pointer-events-none"
        />

        {/* Dynamic Handles based on Pin Templates */}
        {data.pins.map((pin) => (
          <div
            key={pin.id}
            className="absolute group"
            style={{ left: `${pin.xPos}%`, top: `${pin.yPos}%` }}
          >
            <Handle
              type="source" // Neutral isn't a valid type, using source and will handle logic in isValidConnection if needed
              position={Position.Top} // Position doesn't matter much for custom placement but required
              id={pin.id}
              className="!w-4 !h-4 !bg-white !border-2 !border-orange-600 !shadow-sm hover:!scale-125 transition-transform"
              style={{ position: 'absolute', transform: 'translate(-50%, -50%)', top: 0, left: 0 }}
            />
            {/* Tooltip for Pin Info */}
            <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-800 text-white text-[8px] rounded whitespace-nowrap z-50">
              {pin.name} ({pin.type})
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(EquipmentNode);
