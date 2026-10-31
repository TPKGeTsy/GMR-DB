"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteOffcut } from "@/app/actions/steelOffcuts";

export default function DeleteOffcutButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  if (asking) {
    return (
      <span className="flex items-center gap-2 text-xs">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await deleteOffcut(id);
            setBusy(false);
            setAsking(false);
            router.refresh();
          }}
          className="rounded bg-red-600 px-2 py-1 font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          ลบ {label}
        </button>
        <button type="button" onClick={() => setAsking(false)} className="text-gray-600 hover:underline">
          ยกเลิก
        </button>
      </span>
    );
  }
  return (
    <button type="button" title="ลบเศษนี้ออกจากคลัง" onClick={() => setAsking(true)} className="text-gray-400 hover:text-red-600">
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
