import { getWiringDiagramById, getEquipmentTemplates } from "@/app/actions/wiring";
import { auth } from "@/auth";
import DiagramEditor from "@/components/wiring/DiagramEditor";
import SandboxLoader from "@/components/wiring/SandboxLoader";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function DiagramPage({ params }: { params: { id: string } }) {
  const { id } = await params;
  const [diagramResult, session] = await Promise.all([
    getWiringDiagramById(id),
    auth()
  ]);

  if (!diagramResult.success || !diagramResult.data) {
    notFound();
  }

  const diagram = diagramResult.data;
  const isOwner = diagram.ownerId === session?.user?.id;

  if (diagram.kind === "SANDBOX") {
    const canvasData = (diagram.canvasData as { nodes?: unknown[]; edges?: unknown[] } | null) || {};
    // Only the creator or an ADMIN may edit a saved circuit design.
    const canEditCircuit = isOwner || session?.user?.role === "ADMIN";
    return (
      <div className="space-y-4">
        <div className="flex items-center space-x-4">
          <Link href="/diagrams" className="text-gray-700 hover:text-gray-900">
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <h1 className="text-xl font-bold text-gray-900">Circuit Sandbox</h1>
        </div>

        <div style={{ height: "calc(100vh - 220px)" }}>
          <SandboxLoader
            diagramId={id}
            initialName={diagram.name}
            initialNodes={(canvasData.nodes as never[]) || []}
            initialEdges={(canvasData.edges as never[]) || []}
            isOwner={canEditCircuit}
          />
        </div>
      </div>
    );
  }

  const templatesResult = await getEquipmentTemplates();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/diagrams" className="text-gray-700 hover:text-gray-900">
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <h1 className="text-xl font-bold text-gray-900">Wiring Diagram</h1>
        </div>
      </div>

      <DiagramEditor
        id={id}
        initialData={diagram}
        templates={templatesResult.data || []}
        isOwner={isOwner}
      />
    </div>
  );
}
