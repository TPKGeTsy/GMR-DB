"use client";

import { Trash2 } from "lucide-react";
import { deleteAsset } from "@/app/actions/assets";
import { useState } from "react";

export default function DeleteAssetButton({ id }: { id: string }) {
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (confirm("Are you sure you want to delete this asset?")) {
      setIsDeleting(true);
      const result = await deleteAsset(id);
      if (!result.success) {
        alert(result.error || "Failed to delete asset");
        setIsDeleting(false);
      }
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isDeleting}
      className="text-red-600 hover:text-red-900 p-2 rounded-md hover:bg-red-50 transition-colors disabled:opacity-50"
      title="Delete Asset"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  );
}
