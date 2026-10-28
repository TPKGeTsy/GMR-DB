"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { CircleHelp, X } from "lucide-react";
import { PAGE_HELP, type PageHelpId } from "@/lib/pageHelp";
import SteelHelpVisuals from "./SteelHelpVisuals";

/**
 * A round "?" button that opens a dialog explaining the page: what it is for,
 * its main functions, where the data comes from and the rules behind the
 * numbers. Content lives in lib/pageHelp.ts.
 */
export default function PageHelp({ id }: { id: PageHelpId }) {
  const help = PAGE_HELP[id];
  const [open, setOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="วิธีใช้หน้านี้"
        title="วิธีใช้หน้านี้ / ข้อมูลมาจากไหน"
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 transition hover:border-orange-400 hover:bg-orange-50 hover:text-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-400"
      >
        <CircleHelp className="h-4 w-4" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
          >
            <header className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
              <div>
                <h2 id={titleId} className="text-lg font-semibold text-gray-900">
                  {help.title}
                </h2>
                <p className="mt-0.5 text-xs text-gray-500">ใครใช้ได้: {help.who}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="ปิด"
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="space-y-5 overflow-y-auto px-5 py-4 text-sm text-gray-700">
              {help.visual === "steelCutting" && <SteelHelpVisuals />}
              <section>
                <h3 className="mb-1 font-semibold text-gray-900">หน้านี้ใช้ทำอะไร</h3>
                <p>{help.purpose}</p>
              </section>

              <section>
                <h3 className="mb-1 font-semibold text-gray-900">ฟังก์ชันหลัก</h3>
                <ul className="space-y-2">
                  {help.features.map((f) => (
                    <li key={f.name}>
                      <span className="font-medium text-gray-900">{f.name}</span>
                      <span className="text-gray-600"> — {f.what}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h3 className="mb-1 font-semibold text-gray-900">ข้อมูลมาจากไหน</h3>
                <ul className="space-y-2">
                  {help.sources.map((s) => (
                    <li key={s.name}>
                      <span className="font-medium text-gray-900">{s.name}</span>
                      <span className="text-gray-600"> ← {s.from}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {help.rules && help.rules.length > 0 && (
                <section>
                  <h3 className="mb-1 font-semibold text-gray-900">วิธีคำนวณ / กฎที่ใช้</h3>
                  <div className="space-y-3">
                    {help.rules.map((r) => (
                      <div key={r.title} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <p className="font-medium text-gray-900">{r.title}</p>
                        <p className="mt-1 text-gray-600">{r.body}</p>
                        {r.example && (
                          <pre className="mt-2 whitespace-pre-wrap rounded-md bg-white p-2 text-xs text-gray-800 ring-1 ring-gray-200">
                            {r.example}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {help.tips && help.tips.length > 0 && (
                <section>
                  <h3 className="mb-1 font-semibold text-gray-900">ข้อควรตรวจ</h3>
                  <ul className="list-disc space-y-1.5 pl-5 text-gray-600">
                    {help.tips.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </section>
              )}

              {help.links && help.links.length > 0 && (
                <section className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                  {help.links.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      onClick={() => setOpen(false)}
                      className="rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700 hover:bg-orange-100"
                    >
                      {l.label} →
                    </Link>
                  ))}
                </section>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
