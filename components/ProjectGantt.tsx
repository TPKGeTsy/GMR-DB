"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { addProjectTask, deleteProjectTask, setMemberCapacity, setTaskDone } from "@/app/actions/projects";
import { DUTY_PRESETS, addDays, daysBetween, overloadedDays } from "@/lib/projectTasks";

export interface GanttMember {
  userId: string;
  name: string;
  dailyCapacity: number;
}
export interface GanttTask {
  id: string;
  userId: string;
  duty: string;
  note: string | null;
  startKey: string;
  endKey: string;
  done: boolean;
}

const DAY_W = 28;
const NAME_W = 200;
const COLORS = ["bg-orange-400", "bg-sky-400", "bg-emerald-400", "bg-violet-400", "bg-rose-400", "bg-amber-400"];
const input = "rounded border border-gray-300 px-2 py-1 text-sm focus:border-orange-500 focus:outline-none";

export default function ProjectGantt({
  projectId,
  members,
  tasks,
  todayKey,
  canManage,
  currentUserId,
}: {
  projectId: string;
  members: GanttMember[];
  tasks: GanttTask[];
  todayKey: string;
  canManage: boolean;
  currentUserId?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState(members[0]?.userId ?? "");
  const [duty, setDuty] = useState<string>(DUTY_PRESETS[0]);
  const [custom, setCustom] = useState("");
  const [note, setNote] = useState("");
  const [startKey, setStartKey] = useState(todayKey);
  const [endKey, setEndKey] = useState(todayKey);

  const first = tasks.reduce((m, t) => (t.startKey < m ? t.startKey : m), todayKey);
  const last = tasks.reduce((m, t) => (t.endKey > m ? t.endKey : m), addDays(todayKey, 13));
  const from = addDays(first, -1);
  const days = Math.min(daysBetween(from, last) + 2, 366);
  const dayKeys = Array.from({ length: days }, (_, i) => addDays(from, i));

  const run = (fn: () => Promise<{ success: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      setError(r.success ? null : (r.error ?? "ผิดพลาด"));
    });

  const submit = () =>
    run(() => addProjectTask({ projectId, userId, duty: duty === "__custom" ? custom : duty, note, startKey, endKey }));

  return (
    <div className="space-y-4">
      {canManage && members.length > 0 && (
        <div className="flex flex-wrap items-end gap-2 rounded border border-gray-200 bg-gray-50 p-3">
          <label className="text-xs text-gray-500">
            ใคร
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className={`${input} block`}>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-500">
            หน้าที่
            <select value={duty} onChange={(e) => setDuty(e.target.value)} className={`${input} block`}>
              {DUTY_PRESETS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
              <option value="__custom">อื่นๆ (พิมพ์เอง)…</option>
            </select>
          </label>
          {duty === "__custom" && (
            <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="ชื่อหน้าที่" className={input} />
          )}
          <label className="text-xs text-gray-500">
            ตั้งแต่
            <input
              type="date"
              value={startKey}
              onChange={(e) => {
                setStartKey(e.target.value);
                if (e.target.value > endKey) setEndKey(e.target.value);
              }}
              className={`${input} block`}
            />
          </label>
          <label className="text-xs text-gray-500">
            ถึง
            <input type="date" value={endKey} min={startKey} onChange={(e) => setEndKey(e.target.value)} className={`${input} block`} />
          </label>
          <label className="text-xs text-gray-500">
            หมายเหตุ
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ชุด A" className={`${input} block`} />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={submit}
            className="rounded bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          >
            + เพิ่ม
          </button>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {members.length === 0 ? (
        <p className="text-sm text-gray-400">เพิ่มสมาชิกในทีมก่อน แล้วจึงวางแผนหน้าที่ได้</p>
      ) : (
        <div className="overflow-x-auto">
          <div style={{ width: NAME_W + days * DAY_W }} className="text-xs">
            <div className="flex border-b border-gray-200">
              <div style={{ width: NAME_W }} className="shrink-0 px-2 py-1 font-semibold text-gray-500">
                คน / หน้าที่
              </div>
              {dayKeys.map((k) => (
                <div
                  key={k}
                  style={{ width: DAY_W }}
                  className={`shrink-0 py-1 text-center ${k === todayKey ? "bg-orange-100 font-bold text-orange-700" : "text-gray-400"}`}
                >
                  {Number(k.slice(8))}
                  {k.slice(8) === "01" || k === from ? <div className="text-[9px]">{k.slice(5, 7)}</div> : null}
                </div>
              ))}
            </div>
            {members.map((m) => {
              const mine = tasks.filter((t) => t.userId === m.userId);
              const over = overloadedDays(tasks, m.userId, m.dailyCapacity);
              return (
                <div key={m.userId} className="border-b border-gray-100">
                  <div className="flex items-center gap-3 bg-gray-50 px-2 py-1">
                    <span className="font-semibold text-gray-800">{m.name}</span>
                    <label className="flex items-center gap-1 text-gray-500">
                      ทำได้
                      <input
                        type="number"
                        min={1}
                        max={20}
                        defaultValue={m.dailyCapacity}
                        disabled={!canManage}
                        onBlur={(e) => {
                          const n = Number(e.target.value);
                          if (n !== m.dailyCapacity) run(() => setMemberCapacity(projectId, m.userId, n));
                        }}
                        className="w-12 rounded border border-gray-300 px-1 text-center"
                      />
                      อย่าง/วัน
                    </label>
                    {over.length > 0 && (
                      <span className="flex items-center gap-1 text-red-600">
                        <AlertTriangle className="h-3.5 w-3.5" /> งานซ้อนเกิน {over.length} วัน
                      </span>
                    )}
                  </div>
                  {mine.map((t, i) => (
                    <div key={t.id} className="flex items-center">
                      <div style={{ width: NAME_W }} className="flex shrink-0 items-center justify-between gap-1 px-2 py-1 pl-4 text-gray-700">
                        <label className="flex min-w-0 items-center gap-1.5">
                          <input
                            type="checkbox"
                            className="h-4 w-4 shrink-0"
                            checked={t.done}
                            disabled={pending || !(canManage || t.userId === currentUserId)}
                            onChange={(e) => run(() => setTaskDone(t.id, e.target.checked))}
                            title="ติ๊กเมื่องานนี้เสร็จแล้ว"
                          />
                          <span className={`truncate ${t.done ? "text-gray-400 line-through" : ""}`} title={t.note ? `${t.duty} (${t.note})` : t.duty}>
                            {t.duty}
                          </span>
                        </label>
                        {canManage && (
                          <button
                            type="button"
                            title="ลบ"
                            disabled={pending}
                            onClick={() => run(() => deleteProjectTask(t.id))}
                            className="text-gray-300 hover:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="relative h-6" style={{ width: days * DAY_W }}>
                        <div
                          className={`absolute top-1 h-4 truncate rounded px-1 text-[10px] leading-4 text-white ${t.done ? "bg-gray-300" : COLORS[i % COLORS.length]}`}
                          style={{
                            left: daysBetween(from, t.startKey) * DAY_W,
                            width: (daysBetween(t.startKey, t.endKey) + 1) * DAY_W - 2,
                          }}
                          title={`${t.startKey} → ${t.endKey}`}
                        >
                          {t.note ?? ""}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
