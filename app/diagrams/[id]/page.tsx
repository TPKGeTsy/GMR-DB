import { getWiringDiagramById, getEquipmentTemplates } from "@/app/actions/wiring";
import { auth } from "@/auth";
import DiagramEditor from "@/components/wiring/DiagramEditor";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function DiagramPage({ params }: { params: { id: string } }) {
  const { id } = await params;
  const [diagramResult, templatesResult, session] = await Promise.all([
    getWiringDiagramById(id),
    getEquipmentTemplates(),
    auth()
  ]);

  if (!diagramResult.success || !diagramResult.data) {
    notFound();
  }

  const isOwner = diagramResult.data.ownerId === session?.user?.id;

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
        initialData={diagramResult.data} 
        templates={templatesResult.data || []} 
        isOwner={isOwner} 
      />
    </div>
  );
}
