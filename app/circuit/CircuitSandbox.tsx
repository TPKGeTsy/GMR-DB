'use client';

import { useState, useCallback, useEffect, useMemo, MouseEvent, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  reconnectEdge,
  Background,
  BackgroundVariant,
  MiniMap,
  Panel,
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
import {
  Puzzle, Palette, Cpu, MemoryStick, Type as TypeIcon,
  Undo2, Redo2, ZoomIn, ZoomOut, Maximize, Grid3x3, Trash2, Save, Check, Loader2,
  Search, ShieldCheck, TriangleAlert, CircleAlert
} from 'lucide-react';

import ESP32Node from '@/components/ESP32Node';
import SensorANode from '@/components/SenserANode';
import ConfigurableNode from '@/components/ConfigurableNode';
import TextNode from '@/components/TextNode';
import EditableEdge from '@/components/EditableEdge';
import BoardNode, { symbolSize } from '@/components/circuit/BoardNode';
import { CATEGORIES, KIND_COLORS, KIND_LABELS, type ComponentDef } from '@/lib/circuit/types';
import { COMPONENTS, getComponent, searchComponents } from '@/lib/circuit/library';
import { checkWiring } from '@/lib/circuit/check';
import { createSandboxDiagram, updateSandboxDiagram } from '@/app/actions/wiring';

const nodeTypes: NodeTypes = {
  esp32: ESP32Node,
  sensorA: SensorANode,
  userBoard: ConfigurableNode,
  text: TextNode,
  board: BoardNode,
};

const defaultNodes: Node[] = [
  { id: 'board_esp32_start', type: 'board', position: { x: 80, y: 60 }, data: { libraryId: 'esp32-devkit-v1' } },
  { id: 'board_dht22_start', type: 'board', position: { x: 520, y: 140 }, data: { libraryId: 'dht22' } },
];

const defaultEdges: Edge[] = [];

const edgeTypes: EdgeTypes = {
  customWire: EditableEdge,
};

const wireColors = [
  { color: '#ef4444', label: 'Power rail (VCC)' },
  { color: '#1f2937', label: 'Ground (GND)' },
  { color: '#3b82f6', label: 'Signal (blue)' },
  { color: '#f59e0b', label: 'Signal (amber)' },
];

const componentDefs = [
  { type: 'userBoard' as const, label: 'Custom IC', icon: MemoryStick, iconBg: 'bg-amber-600' },
  { type: 'text' as const, label: 'Text / Note', icon: TypeIcon, iconBg: 'bg-gray-500' },
];

const gridVariants = [BackgroundVariant.Dots, BackgroundVariant.Lines, BackgroundVariant.Cross];

interface Snapshot {
  nodes: Node[];
  edges: Edge[];
}

interface CircuitSandboxProps {
  diagramId?: string;
  initialName?: string;
  initialNodes?: Node[];
  initialEdges?: Edge[];
  isOwner?: boolean;
  projectId?: string;
}

function ToolbarButton({
  onClick, disabled, active, title, className = '', children,
}: {
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center justify-center w-8 h-8 rounded-full transition-colors ${
        disabled
          ? 'text-gray-300 cursor-not-allowed'
          : active
          ? 'bg-orange-50 text-orange-600'
          : 'text-gray-600 hover:bg-gray-100'
      } ${className}`}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-5 bg-gray-200 mx-0.5" />;
}

function tabClass(active: boolean) {
  return `flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
    active ? 'bg-orange-50 text-orange-700' : 'text-gray-500 hover:bg-gray-100'
  }`;
}

function CheckPanel({
  issues,
  onFocus,
}: {
  issues: ReturnType<typeof checkWiring>;
  onFocus: (edgeId: string) => void;
}) {
  const ordered = [...issues].sort((a, b) => Number(b.severity === 'error') - Number(a.severity === 'error'));
  return (
    <div className="space-y-3">
      {ordered.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-800">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          ไม่พบปัญหาในสายที่ต่อระหว่างอุปกรณ์จากไลบรารี
        </div>
      ) : (
        <ul className="space-y-1.5">
          {ordered.map((i, idx) => (
            <li key={idx}>
              <button
                onClick={() => i.edgeId && onFocus(i.edgeId)}
                className={`w-full rounded-lg border p-2 text-left text-[11px] leading-snug ${
                  i.severity === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'
                }`}
              >
                <span className="mb-0.5 flex items-center gap-1 font-semibold">
                  {i.severity === 'error' ? <CircleAlert className="h-3.5 w-3.5" /> : <TriangleAlert className="h-3.5 w-3.5" />}
                  {i.severity === 'error' ? 'ผิดพลาด' : 'ควรตรวจ'}
                </span>
                {i.message}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[10px] text-gray-400">ตรวจแรงดัน / ลัดวงจร / ระดับลอจิก 3.3 V กับ 5 V / พินที่ควรหลีกเลี่ยง เฉพาะอุปกรณ์จากไลบรารี สายที่มีปัญหาแสดงเป็นเส้นประสีแดง/ส้ม ไม่ใช่การรับรองความปลอดภัย โปรดตรวจกับคู่มือก่อนต่อจริง</p>
    </div>
  );
}

function CircuitCanvas({
  diagramId,
  initialName = '',
  initialNodes,
  initialEdges,
  isOwner = true,
  projectId,
}: CircuitSandboxProps) {
  const router = useRouter();
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  const [nodes, setNodes] = useState<Node[]>(initialNodes && initialNodes.length > 0 ? initialNodes : defaultNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges ?? defaultEdges);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [leftTab, setLeftTab] = useState<'components' | 'wires' | 'check'>('components');
  const [search, setSearch] = useState('');
  const [gridIndex, setGridIndex] = useState(0);

  const [name, setName] = useState(initialName);
  const [currentId, setCurrentId] = useState(diagramId);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [past, setPast] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);

  // Only called at meaningful mutation points (not ReactFlow's internal
  // dimension-measurement or selection changes), so it doubles as the
  // "mark unsaved changes" signal.
  const pushHistory = useCallback(() => {
    setPast((p) => {
      const next = [...p, { nodes, edges }];
      return next.length > 50 ? next.slice(next.length - 50) : next;
    });
    setFuture([]);
    setIsDirty(true);
  }, [nodes, edges]);

  const handleNameChange = (value: string) => {
    setName(value);
    setIsDirty(true);
  };

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [{ nodes, edges }, ...f]);
    setNodes(previous.nodes);
    setEdges(previous.edges);
  }, [past, nodes, edges]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture((f) => f.slice(1));
    setPast((p) => [...p, { nodes, edges }]);
    setNodes(next.nodes);
    setEdges(next.edges);
  }, [future, nodes, edges]);

  const handleSave = useCallback(async () => {
    if (!isOwner) return;
    if (!name.trim()) {
      setSaveError('กรุณาตั้งชื่อวงจรก่อนบันทึก');
      return;
    }
    setSaveError(null);
    setIsSaving(true);

    const cleanNodes = nodes.map(({ id, type, position, data }) => ({ id, type, position, data }));
    const cleanEdges = edges.map(({ id, source, target, sourceHandle, targetHandle, type, animated, style }) => ({
      id, source, target, sourceHandle, targetHandle, type, animated, style
    }));

    if (currentId) {
      const res = await updateSandboxDiagram(currentId, name.trim(), { nodes: cleanNodes, edges: cleanEdges });
      if (res.success) {
        setIsDirty(false);
      } else {
        setSaveError(res.error || 'บันทึกไม่สำเร็จ');
      }
    } else {
      const res = await createSandboxDiagram(name.trim(), { nodes: cleanNodes, edges: cleanEdges }, projectId);
      if (res.success && res.data) {
        setCurrentId(res.data.id);
        setIsDirty(false);
        router.replace(`/diagrams/${res.data.id}`);
      } else {
        setSaveError(res.error || 'บันทึกไม่สำเร็จ');
      }
    }
    setIsSaving(false);
  }, [isOwner, name, currentId, nodes, edges, router, projectId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        redo();
      } else if (key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, handleSave]);

  const onNodesChange: OnNodesChange = useCallback((chgs) => {
    const shouldSnapshot = chgs.some(
      (c) => (c.type === 'position' && c.dragging === false) || c.type === 'remove'
    );
    if (shouldSnapshot) pushHistory();
    setNodes((nds) => applyNodeChanges(chgs, nds));
  }, [pushHistory]);

  const onEdgesChange: OnEdgesChange = useCallback((chgs) => {
    if (chgs.some((c) => c.type === 'remove')) pushHistory();
    setEdges((eds) => applyEdgeChanges(chgs, eds));
    if (chgs.some(c => c.type === 'remove' && c.id === selectedEdgeId)) {
      setSelectedEdgeId(null);
    }
  }, [selectedEdgeId, pushHistory]);

  const onConnect: OnConnect = useCallback((params) => {
    pushHistory();
    setEdges((eds) => addEdge({
      ...params,
      type: 'customWire',
      animated: true,
      reconnectable: true,
      style: { stroke: '#22c55e', strokeWidth: 3 }
    }, eds));
  }, [pushHistory]);

  const onEdgeClick = useCallback((_event: MouseEvent, edge: Edge) => {
    setSelectedEdgeId(edge.id);
  }, []);

  const onReconnect: OnReconnect = useCallback((oldEdge, newConnection) => {
    pushHistory();
    setEdges((currentEdges) => reconnectEdge(oldEdge, newConnection, currentEdges));
  }, [pushHistory]);

  const changeWireColor = (color: string) => {
    if (!selectedEdgeId) return;
    pushHistory();
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

  // A part from the library goes to the right of everything already on the sheet.
  const addBoard = (def: ComponentDef) => {
    pushHistory();
    const right = nodes.reduce((max, n) => {
      const w = n.measured?.width ?? (n.type === 'board' ? symbolSize(getComponent(n.data.libraryId) ?? def).width : 200);
      return Math.max(max, n.position.x + w);
    }, 0);
    const position = { x: nodes.length === 0 ? 80 : right + 80, y: 60 };
    const id = `board_${def.id}_${crypto.randomUUID().slice(0, 8)}`;
    setNodes((nds) => [...nds, { id, type: 'board', position, data: { libraryId: def.id } }]);
  };

  const addComponent = (type: 'esp32' | 'sensorA' | 'userBoard' | 'text') => {
    pushHistory();
    const idx = nodes.length;
    const position = { x: 100 + (idx % 5) * 60, y: 100 + Math.floor(idx / 5) * 220 };
    const id = `${type}_${crypto.randomUUID()}`;
    let newNode: Node;
    if (type === 'esp32') {
      newNode = { id, type, position, data: { label: 'ESP32 DevKit V1' } };
    } else if (type === 'sensorA') {
      newNode = { id, type, position, data: { label: 'Sensor A (DHT11)' } };
    } else if (type === 'userBoard') {
      newNode = { id, type, position, data: { label: 'Custom IC', width: 200, height: 150, pins: [] } };
    } else {
      newNode = { id, type, position, data: { text: 'Double-click to edit' } };
    }
    setNodes((nds) => [...nds, newNode]);
  };

  const issues = useMemo(() => checkWiring(nodes, edges), [nodes, edges]);
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  // Wires with a problem are drawn dashed: red for an error, amber for a warning.
  const displayEdges = useMemo(() => {
    const worst = new Map<string, 'error' | 'warning'>();
    for (const i of issues) {
      if (!i.edgeId) continue;
      if (i.severity === 'error' || !worst.has(i.edgeId)) worst.set(i.edgeId, i.severity);
    }
    return edges.map((e) => {
      const sev = worst.get(e.id);
      return sev ? { ...e, style: { ...e.style, stroke: sev === 'error' ? '#dc2626' : '#d97706', strokeDasharray: '8 5' } } : e;
    });
  }, [edges, issues]);
  const focusEdge = (edgeId: string) => {
    setSelectedEdgeId(edgeId);
    setEdges((eds) => eds.map((e) => ({ ...e, selected: e.id === edgeId })));
  };

  const hasSelection = nodes.some((n) => n.selected) || edges.some((e) => e.selected);
  const deleteSelected = () => {
    if (!hasSelection) return;
    pushHistory();
    setNodes((nds) => nds.filter((n) => !n.selected));
    setEdges((eds) => eds.filter((e) => !e.selected));
  };


  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          disabled={!isOwner}
          placeholder="ตั้งชื่อวงจร..."
          className="flex-1 min-w-[160px] max-w-xs px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-900 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none disabled:bg-gray-50 disabled:text-gray-500"
        />
        {isOwner && (
          <button
            onClick={handleSave}
            disabled={isSaving || !name.trim()}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-orange-600 text-white text-sm font-medium hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isSaving ? 'กำลังบันทึก...' : 'Save'}
          </button>
        )}
        {saveError && <span className="text-xs text-red-600">{saveError}</span>}
        {!saveError && currentId && (
          <span className="inline-flex items-center gap-1 text-xs text-gray-400">
            {isDirty ? 'มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก' : (
              <>
                <Check className="w-3.5 h-3.5 text-green-600" />
                บันทึกแล้ว
              </>
            )}
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0 flex border border-gray-200 rounded-xl overflow-hidden bg-white shadow-inner">
        <div className="w-64 border-r border-gray-200 bg-gray-50 flex flex-col overflow-hidden">
          <div className="flex items-center gap-1 p-2 border-b border-gray-200 bg-white">
            <button onClick={() => setLeftTab('components')} className={tabClass(leftTab === 'components')}>
              <Puzzle className="w-3.5 h-3.5" />
              Components
            </button>
            <button onClick={() => setLeftTab('wires')} className={tabClass(leftTab === 'wires')}>
              <Palette className="w-3.5 h-3.5" />
              Wires
            </button>
            <button onClick={() => setLeftTab('check')} className={tabClass(leftTab === 'check')}>
              {errorCount > 0 ? <CircleAlert className="w-3.5 h-3.5 text-red-600" /> : <ShieldCheck className="w-3.5 h-3.5" />}
              ตรวจ
              {issues.length > 0 && (
                <span className={`rounded-full px-1.5 text-[10px] font-bold ${errorCount > 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                  {issues.length}
                </span>
              )}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {leftTab === 'components' ? (
              <div className={`space-y-3 ${isOwner ? '' : 'opacity-40 pointer-events-none'}`}>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-gray-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="ค้นหาบอร์ด / พิน เช่น esp32, I2C"
                    className="w-full rounded-md border border-gray-300 py-1.5 pl-7 pr-2 text-xs outline-none focus:border-orange-500"
                  />
                </div>

                {CATEGORIES.map((cat) => {
                  const list = searchComponents(search).filter((c) => c.category === cat.id);
                  const cards = cat.id === 'general' ? componentDefs : [];
                  if (list.length === 0 && (cards.length === 0 || search.trim())) return null;
                  return (
                    <div key={cat.id}>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">{cat.label}</p>
                      <div className="space-y-1">
                        {list.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => addBoard(c)}
                            title={c.description}
                            className="flex w-full items-center gap-2 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-left transition-colors hover:border-orange-400 hover:bg-orange-50"
                          >
                            <Cpu className="h-4 w-4 shrink-0 text-slate-500" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[11px] font-medium text-gray-800">{c.name}</span>
                              <span className="block truncate text-[10px] text-gray-400">
                                {c.pins.length} ขา{c.maker ? ` · ${c.maker}` : ''}
                              </span>
                            </span>
                            {!c.verified && <span className="shrink-0 rounded bg-amber-100 px-1 text-[9px] font-bold text-amber-700">แม่แบบ</span>}
                          </button>
                        ))}
                        {cards.length > 0 && !search.trim() && (
                          <div className="grid grid-cols-2 gap-2">
                            {cards.map((c) => (
                              <button
                                key={c.type}
                                onClick={() => addComponent(c.type)}
                                className="flex flex-col items-center gap-1.5 rounded-lg border border-gray-200 bg-white p-2.5 transition-all hover:border-orange-400 hover:shadow-sm"
                              >
                                <div className={`flex h-8 w-8 items-center justify-center rounded-md ${c.iconBg}`}>
                                  <c.icon className="h-4 w-4 text-white" />
                                </div>
                                <span className="text-center text-[11px] font-medium leading-tight text-gray-700">{c.label}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {search.trim() && searchComponents(search).length === 0 && <p className="text-[11px] text-gray-400">ไม่พบอุปกรณ์ที่ตรงกับ &quot;{search}&quot;</p>}

                <div className="border-t border-gray-200 pt-2">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">สีของขา</p>
                  <ul className="space-y-0.5">
                    {(Object.keys(KIND_COLORS) as (keyof typeof KIND_COLORS)[]).map((k) => (
                      <li key={k} className="flex items-center gap-1.5 text-[10px] text-gray-500">
                        <span className="h-2 w-2 rounded-full" style={{ background: KIND_COLORS[k] }} />
                        {KIND_LABELS[k]}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-[10px] text-gray-400">{COMPONENTS.length} อุปกรณ์ในไลบรารี · วางเมาส์บนขาเพื่อดูหน้าที่</p>
                </div>
              </div>
            ) : leftTab === 'wires' ? (
              <>
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
              </>
            ) : (
              <CheckPanel issues={issues} onFocus={focusEdge} />
            )}
          </div>
        </div>

        <div className="flex-1 h-full relative">
          <ReactFlow
            nodes={nodes}
            edges={displayEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onReconnect={onReconnect}
            onEdgeClick={onEdgeClick}
            connectionMode={ConnectionMode.Loose}
            deleteKeyCode={['Backspace', 'Delete']}
            nodesDraggable={isOwner}
            nodesConnectable={isOwner}
            elementsSelectable={isOwner}
            fitView
          >
            <Background color="#cbd5e1" variant={gridVariants[gridIndex]} gap={16} size={1} />

            <MiniMap
              pannable
              zoomable
              className="!bg-white !border !border-gray-200 !rounded-lg !shadow-md"
              nodeColor="#f97316"
              maskColor="rgba(15,23,42,0.06)"
            />

            <Panel position="top-center">
              <div className="flex items-center gap-0.5 bg-white rounded-full shadow-lg border border-gray-200 px-2 py-1.5">
                <ToolbarButton onClick={undo} disabled={past.length === 0} title="Undo (Ctrl+Z)">
                  <Undo2 className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton onClick={redo} disabled={future.length === 0} title="Redo (Ctrl+Y)">
                  <Redo2 className="w-4 h-4" />
                </ToolbarButton>

                <ToolbarDivider />

                <ToolbarButton onClick={() => zoomOut({ duration: 150 })} title="Zoom out">
                  <ZoomOut className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton onClick={() => fitView({ padding: 0.2, duration: 200 })} title="Fit view">
                  <Maximize className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton onClick={() => zoomIn({ duration: 150 })} title="Zoom in">
                  <ZoomIn className="w-4 h-4" />
                </ToolbarButton>

                <ToolbarDivider />

                <ToolbarButton
                  onClick={() => setGridIndex((i) => (i + 1) % gridVariants.length)}
                  title="Toggle grid style"
                >
                  <Grid3x3 className="w-4 h-4" />
                </ToolbarButton>

                <ToolbarDivider />

                <ToolbarButton
                  onClick={deleteSelected}
                  disabled={!hasSelection || !isOwner}
                  title="Delete selected"
                  className="hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </ToolbarButton>
              </div>
            </Panel>
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}

export default function CircuitSandbox(props: CircuitSandboxProps) {
  return (
    <ReactFlowProvider>
      <CircuitCanvas {...props} />
    </ReactFlowProvider>
  );
}
