"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadProjectFile, deleteProjectFile } from "@/app/actions/projects";
import { FileText, Image as ImageIcon, Box, File as FileIcon, Download, Trash2, Upload } from "lucide-react";
import { formatThaiDate } from "@/lib/datetime";

interface ProjectFile {
  id: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
  uploadedById: string;
  uploadedBy: { id: string; username: string; fullName: string | null };
}

const THREE_D_EXTENSIONS = new Set(["step", "stp", "stl", "obj", "iges", "igs"]);

function fileIconFor(fileName: string, fileType: string) {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (fileType.startsWith("image/")) return ImageIcon;
  if (fileType === "application/pdf" || ext === "pdf") return FileText;
  if (THREE_D_EXTENSIONS.has(ext)) return Box;
  return FileIcon;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ProjectFileManager({
  projectId,
  files,
  currentUserId,
  isAdmin,
  canManage,
}: {
  projectId: string;
  files: ProjectFile[];
  currentUserId?: string;
  isAdmin: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    formData.set("file", file);
    const result = await uploadProjectFile(projectId, formData);

    if (!result.success) {
      setError(result.error || "แนบไฟล์ไม่สำเร็จ");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    setIsUploading(false);
    router.refresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("ลบไฟล์นี้ถาวร? การกระทำนี้ย้อนกลับไม่ได้")) return;
    const result = await deleteProjectFile(id);
    if (!result.success) alert(result.error || "ลบไม่สำเร็จ");
    router.refresh();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-900 text-white hover:bg-gray-800 text-sm font-medium cursor-pointer disabled:opacity-50">
          <Upload className="w-4 h-4" />
          {isUploading ? "กำลังอัปโหลด..." : "แนบไฟล์"}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.step,.stp,.stl,.obj,.iges,.igs"
            className="hidden"
            disabled={isUploading}
            onChange={handleFileChange}
          />
        </label>
        <p className="text-[11px] text-gray-400">รูปภาพ, PDF, ไฟล์ 3D/CAD (STEP, STL, OBJ, IGES) ไม่เกิน 50MB</p>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {files.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-3">ยังไม่มีไฟล์แนบในโปรเจกต์นี้</p>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-md overflow-hidden">
          {files.map((f) => {
            const Icon = fileIconFor(f.fileName, f.fileType);
            const canDelete = isAdmin || canManage || f.uploadedById === currentUserId;
            return (
              <li key={f.id} className="flex items-center justify-between px-3 py-2 bg-white gap-2">
                <a
                  href={f.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-gray-900 hover:text-orange-600 truncate min-w-0"
                >
                  <Icon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  <span className="truncate">{f.fileName}</span>
                  <span className="text-[10px] text-gray-400 flex-shrink-0">
                    ({formatFileSize(f.fileSize)} · {f.uploadedBy.fullName || f.uploadedBy.username} · {formatThaiDate(f.createdAt)})
                  </span>
                </a>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <a
                    href={f.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-orange-600"
                    title="ดาวน์โหลด"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                  {canDelete && (
                    <button
                      onClick={() => handleDelete(f.id)}
                      className="text-gray-400 hover:text-red-600"
                      title="ลบถาวร"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
