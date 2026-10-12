"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SmartAlert } from "@/ai/alerts";
import { TIMEZONE } from "@/lib/time";
import { dismissAlert, moveEvent } from "@/app/(app)/calendar/actions";

/** Avisa de choques entre el gym y las reuniones, con acción en un toque. */
export function SmartAlerts({ alerts }: { alerts: SmartAlert[] }) {
  const router = useRouter();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const visible = alerts.filter((a) => !hidden.has(a.id));
  if (!visible.length) return null;

  const done = (id: string) => {
    setHidden((h) => new Set(h).add(id));
    window.dispatchEvent(new Event("calendar:refresh"));
    router.refresh();
  };

  return (
    <div className="space-y-2" role="region" aria-label="Avisos">
      {visible.map((a) => (
        <div key={a.id} className={`card flex flex-col gap-3 border-l-4 p-3 sm:flex-row sm:items-center ${a.kind === "conflict" ? "border-l-red" : "border-l-coral"}`}>
          <svg viewBox="0 0 24 24" className={`hidden h-6 w-6 shrink-0 sm:block ${a.kind === "conflict" ? "text-red" : "text-coral"}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{a.title}</p>
            <p className="text-sm text-muted">{a.body}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              className="btn-ghost h-11 px-3 text-sm"
              disabled={pending}
              onClick={() => start(async () => {
                const r = await dismissAlert(a.eventId);
                if (r.ok) done(a.id);
                else setError(r.error);
              })}
            >
              Mantener
            </button>
            {a.suggestion && (
              <button
                className="btn-primary h-11 px-3 text-sm"
                disabled={pending}
                onClick={() => start(async () => {
                  const r = await moveEvent(a.eventId, a.suggestion!.start, a.suggestion!.end);
                  if (r.ok) done(a.id);
                  else setError(r.error);
                })}
              >
                Mover a las {new Date(a.suggestion.start).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: TIMEZONE })}
              </button>
            )}
          </div>
        </div>
      ))}
      {error && <p className="text-sm text-red">{error}</p>}
    </div>
  );
}
