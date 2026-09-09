'use client';

import { useState, useCallback, MouseEvent } from 'react';
import {
  ReactFlow,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  reconnectEdge,
  Background,
  BackgroundVariant,
  Controls,
  Node,
  Edge,
  NodeTypes,
  EdgeTypes,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  OnReconnect,
  ConnectionMode
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Palette } from 'lucide-react';

import ESP32Node from '@/components/ESP32Node';
import SensorANode from '@/components/SenserANode';
import ConfigurableNode from '@/components/ConfigurableNode';
import EditableEdge from '@/components/EditableEdge';

const nodeTypes: NodeTypes = {
  esp32: ESP32Node,
  sensorA: SensorANode,
  userBoard: ConfigurableNode
};

const initialNodes: Node[] = [
  { id: 'my_esp32_board', type: 'esp32', position: { x: 100, y: 100 }, data: { label: 'ESP32 DevKit V1' } },
  { id: 'my_sensor_a', type: 'sensorA', position: { x: 450, y: 100 }, data: { label: 'Sensor A (DHT11)' } },
  {
    id: 'my_custom_chip',
    type: 'userBoard',
    position: { x: 600, y: 100 },
    data: {
      label: 'IC-74HC595',
      width: 220,
      height: 180,
      pins: [
        { id: 'p_vcc', name: 'VCC', position: 'Left', top: 50, color: '#ef4444' },
        { id: 'p_gnd', name: 'GND', position: 'Left', top: 90, color: '#94a3b8' },
        { id: 'p_out', name: 'QA', position: 'Right', top: 50, color: '#34d399' }
      ]
    }
  }
];

const initialEdges: Edge[] = [];

const edgeTypes: EdgeTypes = {
  customWire: EditableEdge,
};

const wireColors = [
  { color: '#ef4444', label: 'Power rail (VCC)' },
  { color: '#1f2937', label: 'Ground (GND)' },
  { color: '#3b82f6', label: 'Signal (blue)' },
  { color: '#f59e0b', label: 'Signal (amber)' },
];

export default function CircuitSandbox() {
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  const onNodesChange: OnNodesChange = useCallback(
    (chgs) => setNodes((nds) => applyNodeChanges(chgs, nds)),
    []
  );

  const onEdgesChange: OnEdgesChange = useCallback((chgs) => {
    setEdges((eds) => applyEdgeChanges(chgs, eds));
    if (chgs.some(c => c.type === 'remove' && c.id === selectedEdgeId)) {
      setSelectedEdgeId(null);
    }
  }, [selectedEdgeId]);

  const onConnect: OnConnect = useCallback((params) => {
    setEdges((eds) => addEdge({
      ...params,
      type: 'customWire',
      animated: true,
      reconnectable: true,
      style: { stroke: '#22c55e', strokeWidth: 3 }
    }, eds));
  }, []);

  const onEdgeClick = useCallback((_event: MouseEvent, edge: Edge) => {
    setSelectedEdgeId(edge.id);
  }, []);

  const onReconnect: OnReconnect = useCallback((oldEdge, newConnection) => {
    setEdges((currentEdges) => reconnectEdge(oldEdge, newConnection, currentEdges));
  }, []);

  const changeWireColor = (color: string) => {
    if (!selectedEdgeId) return;
    setEdges((eds) =>
      eds.map((edge) => {
        if (edge.id === selectedEdgeId) {
          return {
            ...edge,
            style: { ...edge.style, stroke: color }
          };
        }
        return edge;
      })
    );
  };

  return (
    <div className="flex h-full border border-gray-200 rounded-xl overflow-hidden bg-white shadow-inner">
      <div className="w-64 border-r border-gray-200 bg-gray-50 p-4 overflow-y-auto">
        <h3 className="flex items-center gap-1.5 font-bold text-gray-900 mb-4">
          <Palette className="w-4 h-4 text-orange-600" />
          Wire Customizer
        </h3>

        <div className="bg-white border border-gray-200 rounded-lg p-3 text-xs mb-4">
          {selectedEdgeId ? (
            <div className="flex items-center gap-1.5 text-gray-700">
              <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
              Selected wire:
              <code className="text-amber-600 font-mono">{selectedEdgeId.slice(0, 8)}</code>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-gray-400">
              <span className="w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" />
              Click a wire to select it
            </div>
          )}
        </div>

        <p className="text-xs text-gray-500 mb-2">Change selected wire color:</p>
        <div className={`flex gap-2.5 ${selectedEdgeId ? '' : 'opacity-40 pointer-events-none'}`}>
          {wireColors.map(({ color, label }) => (
            <button
              key={color}
              onClick={() => changeWireColor(color)}
              title={label}
              className="w-8 h-8 rounded-full shadow-sm border border-black/10 hover:scale-110 transition-transform"
              style={{ background: color }}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 h-full relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onReconnect={onReconnect}
          onEdgeClick={onEdgeClick}
          connectionMode={ConnectionMode.Loose}
          deleteKeyCode={['Backspace', 'Delete']}
          fitView
        >
          <Background color="#cbd5e1" variant={BackgroundVariant.Dots} gap={16} size={1} />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}
