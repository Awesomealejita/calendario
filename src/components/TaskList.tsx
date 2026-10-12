"use client";
import { TIMEZONE } from "@/lib/time";
import { useOptimistic, useState, useTransition } from "react";
import type { Task } from "@/lib/types";
import { addTask, toggleTask } from "@/app/(app)/calendar/actions";
import { ListChecks } from "lucide-react";
import { CardTitle } from "@/components/icons";

export function TaskList({ tasks }: { tasks: Task[] }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const [items, setDone] = useOptimistic(tasks, (state, id: string) => state.filter((t) => t.id !== id));

  return (
    <section className="card">
      <CardTitle icon={ListChecks} className="mb-3">Quehaceres</CardTitle>
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await addTask(title, due ? new Date(due).toISOString() : null);
            if (r.ok) {
              setTitle("");
              setDue("");
            } else setMsg(r.error);
          });
        }}
      >
        <input className="input min-w-0 flex-1" placeholder="Añadir quehacer…" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Nuevo quehacer" />
        <input className="input w-[8.5rem] shrink-0 px-2" type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Fecha límite" />
        <button className="btn-primary" disabled={pending || !title.trim()}>+</button>
      </form>
      {msg && <p className="mb-2 text-sm text-danger">{msg}</p>}
      <ul className="divide-y divide-border">
        {items.length === 0 && <li className="py-2 text-sm text-muted">Nada pendiente.</li>}
        {items.map((t) => {
          const overdue = t.due_at && new Date(t.due_at) < new Date();
          return (
            <li key={t.id} className="flex items-center gap-2 py-1">
              <label className="-my-1 -ml-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center">
                <input
                type="checkbox"
                aria-label={`Completar ${t.title}`}
                className="h-5 w-5 accent-[var(--red)]"
                onChange={() =>
                  start(async () => {
                    setDone(t.id);
                    const r = await toggleTask(t.id, true);
                    if (!r.ok) setMsg(r.error);
                    else if (r.warning) setMsg(r.warning);
                  })
                }
              />
              </label>
              <span className="flex-1 text-sm">{t.title}</span>
              {t.source === "outlook" && <span className="rounded-md bg-plum px-1.5 py-0.5 text-xs font-bold text-white">To Do</span>}
              {t.due_at && (
                <span className={`text-xs ${overdue ? "font-bold text-danger" : "text-muted"}`}>
                  {new Date(t.due_at).toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: TIMEZONE })}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
