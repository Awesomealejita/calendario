"use client";
import { TIMEZONE } from "@/lib/time";
import { useState, useTransition } from "react";
import type { Suggestion } from "@/lib/types";
import type { SuggestionAction } from "@/ai/schema";
import { acceptSuggestion, dismissSuggestion, refreshInsights } from "@/app/(app)/insights/actions";
import { Sparkles } from "lucide-react";
import { CardTitle } from "@/components/icons";

const KIND_STYLE: Record<string, string> = {
  gym: "bg-coral text-night",
  work: "bg-plum text-white",
  schedule: "bg-peach text-night",
  tasks: "bg-peach text-night",
  wellbeing: "bg-danger-bg text-danger",
};

const KIND_LABEL: Record<string, string> = { gym: "Gym", work: "Trabajo", schedule: "Agenda", tasks: "Tareas", wellbeing: "Bienestar" };

const ACTION_LABEL: Record<SuggestionAction["type"], string> = {
  none: "Entendido",
  move_event: "Mover",
  create_event: "Añadir al calendario",
  mark_event_status: "Aplicar",
};

export function Suggestions({ items, aiOn }: { items: Suggestion[]; aiOn: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");

  return (
    <section className="card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <CardTitle icon={Sparkles}>Sugerencias</CardTitle>
          {!aiOn && <p className="text-xs text-muted">Modo básico (sin ANTHROPIC_API_KEY)</p>}
        </div>
        <button
          className="btn-ghost text-xs"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await refreshInsights();
              setMsg(r.ok ? (r.count ? "" : "Todo en orden, sin sugerencias.") : r.error);
            })
          }
        >
          {pending ? "Analizando…" : "Analizar ahora"}
        </button>
      </div>
      {msg && <p className="mb-2 text-sm text-muted">{msg}</p>}
      {items.length === 0 ? (
        <p className="text-sm text-muted">No hay sugerencias abiertas.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((s) => {
            const action = s.action as SuggestionAction | null;
            const when =
              action?.start &&
              new Date(action.start).toLocaleString("es-ES", { weekday: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TIMEZONE });
            return (
              <li key={s.id} className="rounded-2xl border border-border bg-surface-2 p-3">
                <div className="mb-1 flex items-center gap-2">
                  <span className={`rounded-md px-1.5 py-0.5 text-xs font-bold ${KIND_STYLE[s.kind] ?? "bg-peach text-night"}`}>{KIND_LABEL[s.kind] ?? s.kind}</span>
                  <h3 className="text-sm font-bold">{s.title}</h3>
                </div>
                <p className="text-sm">{s.body}</p>
                {when && <p className="mt-1 text-xs text-muted">Propuesta: {when}</p>}
                <div className="mt-2 flex gap-2">
                  <button
                    className="btn-primary px-3 text-xs"
                    disabled={pending}
                    onClick={() => start(async () => {
                      const r = await acceptSuggestion(s.id);
                      if (!r.ok) setMsg(r.error);
                    })}
                  >
                    {ACTION_LABEL[action?.type ?? "none"]}
                  </button>
                  {action?.type !== "none" && (
                    <button className="btn-ghost px-3 text-xs" disabled={pending} onClick={() => start(async () => void (await dismissSuggestion(s.id)))}>
                      Descartar
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
