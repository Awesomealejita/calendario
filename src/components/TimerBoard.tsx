"use client";
import { useEffect, useState, useTransition } from "react";
import type { ActivityType, CalendarEvent, TimeSession } from "@/lib/types";
import { TIMEZONE, formatClock, formatDuration, isPaused, pausedMs, sessionMinutes } from "@/lib/time";
import { pauseAction, startAction, stopAction } from "@/app/(app)/timer/actions";
import { useLocalFlag } from "@/components/hooks";
import { WorkoutLog, type LastSet } from "@/components/WorkoutLog";
import type { WorkoutSet } from "@/lib/types";

/** Parte de la hora del servidor para que el HTML hidratado coincida, y luego avanza cada segundo. */
function useNow(initial: number, active: boolean) {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

const HOLDED_PREF = "timer.holded";

export function TimerBoard({
  types,
  open,
  today,
  next,
  holdedReady,
  serverNow,
  workout,
  history,
}: {
  types: ActivityType[];
  open: TimeSession[];
  today: TimeSession[];
  next: CalendarEvent[];
  holdedReady: boolean;
  serverNow: number;
  /** Sesión de gym abierta o la última de hoy, con sus series. */
  workout: { sessionId: string; sets: WorkoutSet[]; finishedMinutes: number | null } | null;
  history: LastSet[];
}) {
  const now = useNow(serverNow, open.length > 0);
  const [holdedPref, setHolded] = useLocalFlag(HOLDED_PREF, true);
  const holded = holdedReady && holdedPref;
  const [msg, setMsg] = useState<{ text: string; tone: "ok" | "warn" | "err" } | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string; warning?: string | null }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) setMsg({ text: r.error ?? "Error", tone: "err" });
      else if (r.warning) setMsg({ text: r.warning, tone: "warn" });
      else setMsg(null);
    });

  return (
    <div className="space-y-4">
      {msg && (
        <p role="status" className={`rounded-xl px-4 py-3 text-sm ${msg.tone === "err" ? "bg-red text-white" : "bg-peach text-night"}`}>{msg.text}</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {types.map((t) => {
          const s = open.find((o) => o.activity_type_id === t.id);
          const isWork = t.module === "work";
          const paused = s ? isPaused(s) : false;
          const elapsed = s ? (now - new Date(s.started_at).getTime() - pausedMs(s.pauses, now)) / 1000 : 0;
          const nextEv = next.find((e) => e.activity_type_id === t.id);
          const doneToday = today.filter((x) => x.activity_type_id === t.id && x.ended_at).reduce((a, x) => a + sessionMinutes(x, new Date(now)), 0);
          return (
            <section key={t.id} className="card relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: t.color }} />
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">{t.icon} {t.name}</h2>
                <span className="text-xs text-muted">Hoy: {formatDuration(doneToday)}</span>
              </div>
              <p
                className={`my-5 text-center font-mono text-5xl font-extrabold tabular-nums sm:text-6xl ${paused ? "animate-pulse text-muted" : ""}`}
                aria-live="off"
              >
                {formatClock(elapsed)}
              </p>
              {s ? (
                <p className="mb-3 text-center text-xs text-muted">
                  Desde {new Date(s.started_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: TIMEZONE })}
                  {s.event_id ? " · vinculado a tu plan" : " · sin evento planificado"}
                  {paused && " · en pausa"}
                </p>
              ) : nextEv ? (
                <p className="mb-3 text-center text-xs text-muted">
                  Próximo: {nextEv.title} · {new Date(nextEv.starts_at).toLocaleString("es-ES", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: TIMEZONE })}
                </p>
              ) : (
                <p className="mb-3 text-center text-xs text-muted">Sin nada planificado pronto</p>
              )}
              <div className="flex gap-2">
                {!s ? (
                  <button className="btn-primary flex-1 py-3 text-base" disabled={pending} onClick={() => run(() => startAction(t.id, isWork && holded))}>
                    ▶ Empezar
                  </button>
                ) : (
                  <>
                    <button className="btn-ghost flex-1 py-3 text-base" disabled={pending} onClick={() => run(() => pauseAction(s.id, isWork && holded))}>
                      {paused ? "▶ Seguir" : "⏸ Pausa"}
                    </button>
                    <button className="btn-primary flex-1 py-3 text-base" disabled={pending} onClick={() => run(() => stopAction(s.id, isWork && holded))}>
                      ■ Terminar
                    </button>
                  </>
                )}
              </div>
              {t.module === "gym" && workout && (
                <WorkoutLog sessionId={workout.sessionId} sets={workout.sets} history={history} finishedMinutes={workout.finishedMinutes} />
              )}
              {isWork && (
                <label className={`mt-3 flex items-center gap-2 text-sm ${holdedReady ? "" : "text-muted"}`}>
                  <input
                    type="checkbox"
                    checked={holded}
                    disabled={!holdedReady}
                    onChange={(e) => setHolded(e.target.checked)}
                  />
                  Fichar también en Holded {!holdedReady && "(configúralo en Ajustes)"}
                </label>
              )}
            </section>
          );
        })}
      </div>

      <section className="card">
        <h2 className="mb-2 font-bold">Hoy</h2>
        {today.length === 0 ? (
          <p className="text-sm text-muted">Aún no has registrado nada hoy.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {today.map((s) => {
              const t = types.find((x) => x.id === s.activity_type_id);
              return (
                <li key={s.id} className="flex items-center justify-between py-2">
                  <span>
                    {t?.icon} {t?.name ?? "—"} {s.source === "holded" && <span className="ml-1 rounded bg-plum px-1.5 text-[10px] font-bold text-white">Holded</span>}
                  </span>
                  <span className="tabular-nums text-muted">
                    {new Date(s.started_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: TIMEZONE })}–
                    {s.ended_at ? new Date(s.ended_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: TIMEZONE }) : "…"} ·{" "}
                    {formatDuration(sessionMinutes(s, new Date(now)))}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
