"use client";

import { useState, useCallback } from "react";
import {
  ReactFlow,
  addEdge,
  Background,
  Controls,
  Connection,
  Node,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  Panel,
  NodeTypes,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import EquipmentNode, { EquipmentNodeData } from "./EquipmentNode";
import { Save, Plus } from "lucide-react";
import { saveDiagramState } from "@/app/actions/wiring";

const nodeTypes: NodeTypes = {
  equipment: EquipmentNode,
};

interface Pin {
  id: string;
  name: string;
  type: string;
  xPos: number;
  yPos: number;
}

interface Template {
  id: string;
  name: string;
  imageUrl: string;
  pins: Pin[];
}

interface EquipmentInstance {
  id: string;
  template: Template;
  xPos: number;
  yPos: number;
}

interface Wire {
  id: string;
  sourceInstanceId: string;
  sourcePinId: string;
  targetInstanceId: string;
  targetPinId: string;
}

interface DiagramEditorProps {
  id: string;
  initialData: {
    name: string;
    equipments: EquipmentInstance[];
    wires: Wire[];
  };
  templates: Template[];
  isOwner: boolean;
}

function DiagramCanvas({ id, initialData, templates, isOwner }: DiagramEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<EquipmentNodeData>>(
    initialData.equipments.map((eq) => ({
      id: eq.id,
      type: "equipment",
      position: { x: eq.xPos, y: eq.yPos },
      data: {
        name: eq.template.name,
        imageUrl: eq.template.imageUrl,
        pins: eq.template.pins,
      },
    }))
  );

  const [edges, setEdges, onEdgesChange] = useEdgesState(
    initialData.wires.map((w) => ({
      id: w.id,
      source: w.sourceInstanceId,
      target: w.targetInstanceId,
      sourceHandle: w.sourcePinId,
      targetHandle: w.targetPinId,
      type: "step",
      style: { stroke: "#374151", strokeWidth: 3 }, // Gray-700, thicker
    }))
  );

  const [isSaving, setIsSaving] = useState(false);

  const onConnect = useCallback(
    (params: Connection) => {
      // Find source and target pin types for validation
      const sourceNode = nodes.find(n => n.id === params.source);
      const targetNode = nodes.find(n => n.id === params.target);
      const sourcePin = sourceNode?.data.pins.find((p: Pin) => p.id === params.sourceHandle);
      const targetPin = targetNode?.data.pins.find((p: Pin) => p.id === params.targetHandle);

      if (sourcePin && targetPin && sourcePin.type === targetPin.type) {
        setEdges((eds) => addEdge({ 
          ...params, 
          type: "step",
          style: { stroke: "#374151", strokeWidth: 3 } 
        }, eds));
      } else {
        alert(`ประเภทสายไม่ตรงกัน! (${sourcePin?.type} != ${targetPin?.type})`);
      }
    },
    [nodes, setEdges]
  );

  const onSave = async () => {
    setIsSaving(true);
    const state = {
      equipments: nodes.map(n => ({
        id: n.id,
        templateId: templates.find(t => t.name === n.data.name)?.id || "",
        xPos: n.position.x,
        yPos: n.position.y
      })),
      wires: edges.map(e => ({
        sourceInstanceId: e.source,
        sourcePinId: e.sourceHandle || "",
        targetInstanceId: e.target,
        targetPinId: e.targetHandle || "",
        wireType: nodes.find(n => n.id === e.source)?.data.pins.find((p: Pin) => p.id === e.sourceHandle)?.type || ""
      }))
    };

    const result = await saveDiagramState(id, state);
    if (!result.success) {
      alert(result.error);
    }
    setIsSaving(false);
  };

  const addEquipment = (template: Template) => {
    const newNode: Node<EquipmentNodeData> = {
      id: crypto.randomUUID(),
      type: "equipment",
      position: { x: 100, y: 100 },
      data: {
        name: template.name,
        imageUrl: template.imageUrl,
        pins: template.pins,
      },
    };
    setNodes((nds) => nds.concat(newNode));
  };

  return (
    <div className="flex h-[calc(100vh-100px)] border rounded-xl overflow-hidden bg-white shadow-inner">
      {/* Sidebar - Templates */}
      {isOwner && (
        <div className="w-64 border-r bg-gray-50 p-4 overflow-y-auto">
          <h3 className="font-bold text-gray-900 mb-4 flex items-center">
            <Plus className="w-4 h-4 mr-2" /> ลากอุปกรณ์ลง Canvas
          </h3>
          <div className="space-y-3">
            {templates.map((t) => (
              <div
                key={t.id}
                className="p-3 bg-white border rounded-lg shadow-sm hover:border-orange-500 cursor-move transition-all group"
                draggable
                onDragEnd={() => addEquipment(t)}
                onClick={() => addEquipment(t)}
              >
                <div className="aspect-square w-full mb-2 bg-gray-50 rounded flex items-center justify-center overflow-hidden">
                  <img src={t.imageUrl} alt={t.name} className="max-w-full max-h-full object-contain" />
                </div>
                <p className="text-xs font-medium text-center truncate">{t.name}</p>
                <p className="text-[10px] text-gray-400 text-center">{t.pins.length} pins</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Canvas */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          nodesDraggable={isOwner}
          nodesConnectable={isOwner}
          elementsSelectable={isOwner}
        >
          <Background color="#ccc" variant={BackgroundVariant.Dots} />
          <Controls />
          <Panel position="top-right" className="space-x-2">
            {isOwner && (
              <button
                onClick={onSave}
                disabled={isSaving}
                className="flex items-center px-4 py-2 bg-orange-600 text-white rounded-lg shadow hover:bg-orange-700 disabled:opacity-50 text-sm font-medium"
              >
                <Save className="w-4 h-4 mr-2" />
                {isSaving ? "Saving..." : "Save Diagram"}
              </button>
            )}
          </Panel>
          <Panel position="top-left">
             <div className="bg-white/80 backdrop-blur p-2 rounded-lg border shadow-sm">
                <h2 className="text-sm font-bold text-orange-600">{initialData.name}</h2>
                <p className="text-[10px] text-gray-500">
                  {isOwner ? "โหมดแก้ไข (Owner)" : "โหมดดูอย่างเดียว (Viewer)"}
                </p>
             </div>
          </Panel>
        </ReactFlow>
      </div>
    </div>
  );
}

export default function DiagramEditor(props: DiagramEditorProps) {
  return (
    <ReactFlowProvider>
      <DiagramCanvas {...props} />
    </ReactFlowProvider>
  );
}
