'use client';

import dynamic from 'next/dynamic';
import type { Node, Edge } from '@xyflow/react';

// Loaded dynamically with SSR off — ReactFlow needs the browser's DOM/canvas APIs.
// Must live in a Client Component: `dynamic(..., { ssr: false })` isn't allowed in Server Components.
const CircuitSandbox = dynamic(() => import('@/app/circuit/CircuitSandbox'), { ssr: false });

export default function SandboxLoader(props: {
  diagramId: string;
  initialName: string;
  initialNodes: Node[];
  initialEdges: Edge[];
  isOwner: boolean;
}) {
  return <CircuitSandbox {...props} />;
}
