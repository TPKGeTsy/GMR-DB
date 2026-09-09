import { getWiringDiagrams, createWiringDiagram } from "@/app/actions/wiring";
import { auth } from "@/auth";
import Link from "next/link";
import { Plus, Share2, User, Clock } from "lucide-react";
import { redirect } from "next/navigation";

interface Diagram {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  owner: { username: string };
  createdAt: Date;
}

export default async function DiagramsListPage() {
  const result = await getWiringDiagrams();
  const session = await auth();

  async function handleCreate(formData: FormData) {
    "use server";
    const name = formData.get("name") as string;
    const res = await createWiringDiagram(name);
    if (res.success && res.data) {
      redirect(`/diagrams/${res.data.id}`);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-orange-600">Wiring Diagrams</h1>
        {session && (
          <form action={handleCreate} className="flex gap-2">
            <input
              name="name"
              placeholder="ชื่อไดอะแกรมใหม่..."
              required
              className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none"
            />
            <button
              type="submit"
              className="inline-flex items-center px-4 py-2 bg-orange-600 text-white rounded-lg shadow hover:bg-orange-700 text-sm font-medium"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Diagram
            </button>
          </form>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {(result.data as Diagram[])?.map((diagram) => (
          <Link
            key={diagram.id}
            href={`/diagrams/${diagram.id}`}
            className="group bg-white border rounded-xl p-5 hover:shadow-md transition-all hover:border-orange-300"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-gray-50 rounded-lg text-gray-700 group-hover:bg-orange-600 group-hover:text-white transition-colors">
                <Share2 className="w-6 h-6" />
              </div>
              {diagram.isPublic && (
                <span className="px-2 py-1 bg-green-100 text-green-800 text-[10px] font-bold rounded-full uppercase">
                  Public
                </span>
              )}
            </div>
            <h3 className="font-bold text-gray-900 group-hover:text-orange-600 transition-colors mb-1">
              {diagram.name}
            </h3>
            <p className="text-xs text-gray-700 line-clamp-2 mb-4 h-8">
              {diagram.description || "ไม่มีคำอธิบาย"}
            </p>
            <div className="flex items-center justify-between text-[10px] text-gray-600 border-t pt-4">
              <div className="flex items-center">
                <User className="w-3 h-3 mr-1 text-gray-700" />
                {diagram.owner.username}
              </div>
              <div className="flex items-center">
                <Clock className="w-3 h-3 mr-1 text-gray-700" />
                {new Date(diagram.createdAt).toLocaleDateString()}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
