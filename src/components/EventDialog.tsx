"use client";
import { useState, useTransition } from "react";
import type { ActivityType, CalendarEvent } from "@/lib/types";
import { deleteEvent, saveEvent, setEventStatus } from "@/app/(app)/calendar/actions";

export interface DraftEvent {
  id?: string;
  title: string;
  activity_type_id: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  notes: string | null;
  location: string | null;
  source?: CalendarEvent["source"];
  status?: CalendarEvent["status"];
  metadata?: Record<string, unknown>;
}

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = (v: string) => new Date(v).toISOString();

export function EventDialog({
  draft,
  types,
  outlookConnected,
  onClose,
  onSaved,
}: {
  draft: DraftEvent;
  types: ActivityType[];
  outlookConnected: boolean;
  onClose: () => void;
  onSaved: (msg?: string) => void;
}) {
  // El padre monta el diálogo con `key` por evento, así el estado se reinicia sin efectos.
  const [form, setForm] = useState<DraftEvent>(draft);
  const [pushToOutlook, setPush] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const readOnly = form.source === "ics";
  const type = types.find((t) => t.id === form.activity_type_id);
  const set = (patch: Partial<DraftEvent>) => setForm({ ...form, ...patch });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await saveEvent({
        id: form.id,
        title: form.title,
        activity_type_id: form.activity_type_id,
        starts_at: form.starts_at,
        ends_at: form.ends_at,
        all_day: form.all_day,
        notes: form.notes || null,
        location: form.location || null,
        pushToOutlook,
      });
      if (r.ok) onSaved(r.warning);
      else setError(r.error);
    });
  };
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) onSaved();
      else setError(r.error ?? "Error");
    });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-night/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-3xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{form.id ? "Editar" : "Nuevo"} {type ? type.name.toLowerCase() : "evento"}</h2>
          <button type="button" onClick={onClose} className="text-muted" aria-label="Cerrar">✕</button>
        </div>

        {form.source && form.source !== "local" && (
          <p className="mb-3 rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
            {form.source === "outlook" ? "Sincronizado con Outlook: los cambios se envían a Outlook." : "Importado por ICS (solo lectura)."}
            {typeof form.metadata?.joinUrl === "string" && (
              <a className="ml-1 font-semibold text-plum underline dark:text-peach" href={form.metadata.joinUrl} target="_blank" rel="noreferrer">Unirse</a>
            )}
          </p>
        )}

        <div className="mb-3 flex flex-wrap gap-2">
          {types.map((t) => (
            <button
              type="button"
              key={t.id}
              disabled={readOnly}
              onClick={() => set({ activity_type_id: t.id })}
              className={`rounded-full border px-3 py-1 text-sm font-semibold ${form.activity_type_id === t.id ? "border-transparent text-night" : "border-border text-muted"}`}
              style={form.activity_type_id === t.id ? { background: t.color } : undefined}
            >
              {t.icon} {t.name}
            </button>
          ))}
        </div>

        <label className="label" htmlFor="ev-title">Título</label>
        <input id="ev-title" className="input mb-3" required value={form.title} disabled={readOnly} onChange={(e) => set({ title: e.target.value })} />

        <div className="mb-3 grid grid-cols-2 gap-2">
          <div>
            <label className="label" htmlFor="ev-start">Inicio</label>
            <input id="ev-start" type="datetime-local" className="input" disabled={readOnly} value={toLocalInput(form.starts_at)}
              onChange={(e) => {
                if (!e.target.value) return;
                const dur = new Date(form.ends_at).getTime() - new Date(form.starts_at).getTime();
                const s = fromLocalInput(e.target.value);
                set({ starts_at: s, ends_at: new Date(new Date(s).getTime() + Math.max(dur, 0)).toISOString() });
              }} />
          </div>
          <div>
            <label className="label" htmlFor="ev-end">Fin</label>
            <input id="ev-end" type="datetime-local" className="input" disabled={readOnly} value={toLocalInput(form.ends_at)}
              onChange={(e) => e.target.value && set({ ends_at: fromLocalInput(e.target.value) })} />
          </div>
        </div>

        <label className="mb-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.all_day} disabled={readOnly} onChange={(e) => set({ all_day: e.target.checked })} /> Todo el día
        </label>

        <label className="label" htmlFor="ev-loc">Lugar</label>
        <input id="ev-loc" className="input mb-3" value={form.location ?? ""} disabled={readOnly} onChange={(e) => set({ location: e.target.value })} />

        <label className="label" htmlFor="ev-notes">Notas</label>
        <textarea id="ev-notes" className="input mb-3" rows={2} value={form.notes ?? ""} disabled={readOnly} onChange={(e) => set({ notes: e.target.value })} />

        {outlookConnected && (!form.source || form.source === "local") && (
          <label className="mb-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={pushToOutlook} onChange={(e) => setPush(e.target.checked)} /> Crear también en Outlook
          </label>
        )}

        {error && <p className="mb-3 text-sm text-red">{error}</p>}

        {form.id && (
          <div className="mb-3 flex flex-wrap gap-2">
            <button type="button" className="btn-ghost" disabled={pending} onClick={() => run(() => setEventStatus(form.id!, "done"))}>✓ Hecho</button>
            <button type="button" className="btn-ghost" disabled={pending} onClick={() => run(() => setEventStatus(form.id!, "missed"))}>✗ No fui</button>
            {form.source === "local" && (
              <button type="button" className="btn-ghost text-red" disabled={pending} onClick={() => confirm("¿Borrar el evento?") && run(() => deleteEvent(form.id!))}>Borrar</button>
            )}
          </div>
        )}

        {!readOnly && (
          <button className="btn-primary w-full" disabled={pending}>{pending ? "Guardando…" : "Guardar"}</button>
        )}
      </form>
    </div>
  );
}
