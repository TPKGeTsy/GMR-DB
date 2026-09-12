'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Cpu, Share2 } from 'lucide-react';

// Loaded dynamically with SSR off — ReactFlow needs the browser's DOM/canvas APIs.
const CircuitSandbox = dynamic(
  () => import('./CircuitSandbox'),
  { ssr: false }
);

function CircuitPageContent() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId') || undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <Cpu className="mr-2 h-6 w-6 text-orange-600" />
            Circuit Sandbox
          </h1>
          <p className="text-gray-500">
            {projectId
              ? 'บันทึกแล้วจะเชื่อมเข้ากับโปรเจกต์นี้อัตโนมัติ'
              : 'Prototype board connections before wiring the real hardware'}
          </p>
        </div>
        <Link
          href="/diagrams"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:text-orange-600 hover:border-orange-300 transition-colors"
        >
          <Share2 className="w-4 h-4" />
          ดูวงจรที่บันทึกไว้
        </Link>
      </div>

      <div style={{ height: 'calc(100vh - 260px)' }}>
        <CircuitSandbox projectId={projectId} />
      </div>
    </div>
  );
}

export default function SimulatorPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-gray-400">Loading...</div>}>
      <CircuitPageContent />
    </Suspense>
  );
}
