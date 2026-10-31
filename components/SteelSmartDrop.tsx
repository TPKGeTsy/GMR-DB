"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { smartImportFile, type SmartImportResult } from "@/app/actions/steelSmartImport";
import { teachSteelAlias } from "@/app/actions/steelAliases";
import { filesFromDrop } from "@/lib/dropFiles";
import { STEEL_TYPE_KEYS, STEEL_TYPES } from "@/lib/steel";
import { rememberTimes, rememberedTimes } from "@/components/SteelStagedFiles";

const accepted = (f: File) => /\.(pdf|dxf|csv|txt|tsv|png|jpe?g|webp)$/i.test(f.name);
const noSubscribe = () => () => {};

/** A skipped row whose steel the reader does not know: say what the word is, once, and it is read from then on. */
function TeachRow({ line }: { line: string }) {
  const guess = new RegExp("[A-Za-z][A-Za-z0-9.-]{1,}").exec(line)?.[0]?.toUpperCase() ?? "";
  const [word, setWord] = useState(guess);
  const [type, setType] = useState("CHANNEL");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="ml-1 inline-flex flex-wrap items-center gap-1 text-gray-700">
      <input value={word} onChange={(e) => setWord(e.target.value)} className="w-24 rounded border border-gray-300 px-1 py-0.5 text-xs" aria-label="คำในแบบ" />
      =
      <select value={type} onChange={(e) => setType(e.target.value)} className="rounded border border-gray-300 px-1 py-0.5 text-xs">
        {STEEL_TYPE_KEYS.filter((k) => STEEL_TYPES[k].needsY && k !== "BOX").map((k) => (
          <option key={k} value={k}>
            {STEEL_TYPES[k].label.replace(/ \(.*\)$/, "")}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-xs hover:bg-gray-50"
        onClick={async () => {
          const res = await teachSteelAlias(word, type);
          setMsg(res.success ? "จำแล้ว — วางไฟล์นี้อีกครั้ง" : res.error);
        }}
      >
        สอนระบบ
      </button>
      {msg && <span className="text-xs text-green-700">{msg}</span>}
    </span>
  );
}

/** One drop zone for everything of a job: cut-list PDFs, parts-list PDFs, DXF flat patterns, pictures.
 *  Each file is recognised by what is inside it; the number of sets is typed once. */
export default function SteelSmartDrop({ planId, empty = false }: { planId: string; empty?: boolean }) {
  const router = useRouter();
  const stored = useSyncExternalStore(noSubscribe, rememberedTimes, () => "1");
  const [typed, setTyped] = useState<string | null>(null);
  const rounds = typed ?? stored;
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<SmartImportResult[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number; name: string } | null>(null);

  const run = async (files: File[]) => {
    if (files.length === 0 || busy) return;
    setBusy(true);
    setResults([]);
    const done: SmartImportResult[] = [];
    for (const [i, file] of files.entries()) {
      setProgress({ done: i, total: files.length, name: file.name });
      const form = new FormData();
      form.set("file", file);
      form.set("rounds", rounds);
      done.push(await smartImportFile(planId, form));
      setResults([...done]);
    }
    setProgress(null);
    setBusy(false);
    router.refresh();
  };

  const ok = results.filter((r) => r.ok).length;

  return (
    <section id="sec-import" className="scroll-mt-36 rounded-lg border border-gray-200 bg-white p-4 shadow-sm print:hidden">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
          <Upload className="h-4 w-4 text-orange-600" />
          วางไฟล์ของงานนี้ทั้งหมดที่เดียว
        </h2>
        <label className="ml-auto flex items-center gap-1.5 text-sm text-gray-600">
          จำนวนชุด ×
          <input
            type="number"
            min={1}
            max={1000}
            value={rounds}
            disabled={busy}
            onChange={(e) => {
              setTyped(e.target.value);
              rememberTimes(e.target.value);
            }}
            className="w-16 rounded border border-gray-300 px-2 py-1 text-right text-sm"
            aria-label="จำนวนชุด"
          />
        </label>
      </div>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          filesFromDrop(e.dataTransfer, accepted).then(run);
        }}
        className={`mt-3 flex cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed px-3 py-6 text-center text-xs ${
          dragging ? "border-orange-500 bg-orange-50 text-orange-700" : "border-gray-300 bg-gray-50 text-gray-500"
        }`}
      >
        <span className="font-medium text-gray-700">ลากไฟล์หรือทั้งโฟลเดอร์มาวาง หรือคลิกเพื่อเลือก</span>
        <span className="mt-1">ใบตัด PDF · parts list PDF · DXF · CSV · รูป parts list — ระบบดูเองว่าไฟล์ไหนคืออะไร ไฟล์เดิมวางซ้ำ = อัปเดตของเดิม ไม่ซ้ำซ้อน</span>
        <input
          type="file"
          multiple
          accept=".pdf,.dxf,.csv,.txt,.tsv,.png,.jpg,.jpeg,.webp"
          disabled={busy}
          onChange={(e) => {
            run(Array.from(e.target.files ?? []).filter(accepted));
            e.target.value = "";
          }}
          className="sr-only"
        />
      </label>
      {empty && results.length === 0 && !progress && (
        <ol className="mt-3 grid gap-2 text-xs text-gray-600 sm:grid-cols-3">
          <li className="rounded border border-gray-100 bg-gray-50 p-2">
            <span className="font-semibold text-gray-800">1. โยนไฟล์</span>
            <br />
            ใบตัด PDF / DXF / parts list ทั้งโฟลเดอร์ได้เลย
          </li>
          <li className="rounded border border-gray-100 bg-gray-50 p-2">
            <span className="font-semibold text-gray-800">2. ดูตรวจยอด</span>
            <br />
            ยอดชิ้น เศษกี่ % ต้องซื้อกี่เส้น ขึ้นบนหัวหน้าจอ
          </li>
          <li className="rounded border border-gray-100 bg-gray-50 p-2">
            <span className="font-semibold text-gray-800">3. ตัด แล้วติ๊ก</span>
            <br />
            ส่งใบสั่งซื้อเข้า LINE ตัดเสร็จเส้นไหนติ๊กเส้นนั้น
          </li>
        </ol>
      )}
      {progress && (
        <div className="mt-2 space-y-1" role="status">
          <progress className="h-2 w-full overflow-hidden rounded [&::-webkit-progress-bar]:bg-gray-100 [&::-webkit-progress-value]:bg-orange-500" max={progress.total} value={progress.done + 0.5} />
          <p className="text-xs text-gray-500">
            กำลังอ่าน {progress.done + 1}/{progress.total}: {progress.name}
          </p>
        </div>
      )}
      {results.length > 0 && (
        <div className="mt-2 space-y-1 text-xs">
          {!busy && (
            <p className="font-semibold text-gray-700">
              อ่านสำเร็จ {ok}/{results.length} ไฟล์
            </p>
          )}
          <ul className="space-y-1">
            {results.map((r, i) => (
              <li key={i} className={r.ok ? "text-gray-700" : "text-red-600"}>
                {r.ok ? "✓" : "✗"} <span className="font-medium">{r.name}</span> — {r.ok ? r.notes.join(" · ") : r.error}
                {r.skipped.length > 0 && (
                  <details className="ml-4 text-amber-700">
                    <summary className="cursor-pointer">ข้าม {r.skipped.length} แถว (กดดูเหตุผล)</summary>
                    <ul className="ml-3 list-disc">
                      {r.skipped.map((k, j) => (
                        <li key={j}>
                          {k.line}
                          {k.reason && ` — ${k.reason}`}
                          {k.reason.startsWith("ไม่ใช่เหล็กที่รู้จัก") && <TeachRow line={k.line} />}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
