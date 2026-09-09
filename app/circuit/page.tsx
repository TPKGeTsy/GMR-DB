'use client';

import dynamic from 'next/dynamic';
import { Cpu } from 'lucide-react';

// Loaded dynamically with SSR off — ReactFlow needs the browser's DOM/canvas APIs.
const CircuitSandbox = dynamic(
  () => import('./CircuitSandbox'),
  { ssr: false }
);

export default function SimulatorPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <Cpu className="mr-2 h-6 w-6 text-orange-600" />
          Circuit Sandbox
        </h1>
        <p className="text-gray-500">Prototype board connections before wiring the real hardware</p>
      </div>

      <div style={{ height: 'calc(100vh - 260px)' }}>
        <CircuitSandbox />
      </div>
    </div>
  );
}
