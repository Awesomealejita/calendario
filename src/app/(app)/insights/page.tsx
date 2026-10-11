import Link from "next/link";
import { addDays } from "date-fns";
import { analyzeAdherence, weekBounds } from "@/ai/adherence";
import { reconcileWork } from "@/lib/reconcile";
import { aiEnabled } from "@/ai/client";
import { Chat } from "@/components/Chat";
import { Suggestions } from "@/components/Suggestions";
import { loadUserData } from "@/lib/data";
import { requireUser } from "@/lib/supabase/server";
import { formatDuration } from "@/lib/time";
import type { Suggestion } from "@/lib/types";

export const dynamic = "force-dynamic";

const FLAG_LABEL: Record<string, string> = {
  no_clock: "Sin fichar",
  open_clock: "Fichaje abierto",
  overtime: "Horas extra",
  short: "Jornada corta",
  meetings_outside: "Reuniones fuera de fichaje",
};

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ semana?: string }> }) {
  const { supabase, user } = await requireUser();
  const now = new Date();
  // Semana del cuadre: 0 = actual, -1 = anterior… (hasta 8 semanas atrás).
  const offset = Math.max(-8, Math.min(0, Number((await searchParams).semana) || 0));
  const week = weekBounds(addDays(now, offset * 7));
  const from = week.start < addDays(now, -7) ? week.start : addDays(now, -7);
  const [data, { data: suggestions }] = await Promise.all([
    loadUserData(supabase, user.id, from, addDays(now, 3)),
    supabase.from("suggestions").select("*").eq("status", "open").order("created_at", { ascending: false }),
  ]);
  const report = analyzeAdherence({ ...data, now });
  const balance = offset === 0 ? report.workBalance : reconcileWork({ days: week.days, types: data.types, events: data.events, sessions: data.sessions, now });
  const typeById = new Map(data.types.map((t) => [t.id, t]));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Suggestions items={(suggestions ?? []) as Suggestion[]} aiOn={aiEnabled()} />
        <Chat enabled={aiEnabled()} />
      </div>

      <div className="space-y-4">
        <section className="card">
          <h2 className="mb-3 font-bold">🎯 Esta semana</h2>
          {report.weekly.length === 0 && <p className="text-sm text-muted">Define objetivos semanales en Ajustes.</p>}
          <ul className="space-y-3">
            {report.weekly.map((w) => {
              const t = typeById.get(w.activityTypeId);
              const pct = w.goalSessions
                ? Math.min(100, (w.sessions / w.goalSessions) * 100)
                : w.goalMinutes
                  ? Math.min(100, (w.minutes / w.goalMinutes) * 100)
                  : 0;
              return (
                <li key={w.activityTypeId}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-semibold">{t?.icon} {w.name}</span>
                    <span className="tabular-nums text-muted">
                      {w.goalSessions ? `${w.sessions}/${w.goalSessions} sesiones · ` : ""}
                      {formatDuration(w.minutes)}
                      {w.goalMinutes ? ` / ${formatDuration(w.goalMinutes)}` : ""}
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: t?.color ?? "var(--coral)" }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h2 className="font-bold">🧮 Cuadre de horas</h2>
            <nav className="flex items-center gap-1 text-xs" aria-label="Semana del cuadre">
              {offset > -8 && (
                <Link className="btn-ghost px-2 py-1 text-xs" href={`/insights?semana=${offset - 1}`} aria-label="Semana anterior">←</Link>
              )}
              <span className="px-1 font-semibold">
                {offset === 0 ? "Esta semana" : offset === -1 ? "Semana pasada" : `Hace ${-offset} semanas`}
              </span>
              {offset < 0 && (
                <Link className="btn-ghost px-2 py-1 text-xs" href={`/insights?semana=${offset + 1}`} aria-label="Semana siguiente">→</Link>
              )}
            </nav>
          </div>
          <p className="mb-3 text-xs text-muted">Fichajes de Holded vs. cronómetro vs. reuniones de Outlook, por día.</p>
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[520px] whitespace-nowrap text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted">
                  <th className="py-1 pr-3 font-semibold">Día</th>
                  <th className="font-semibold">Holded</th>
                  <th className="font-semibold">Crono</th>
                  <th className="font-semibold">Reuniones</th>
                  <th className="font-semibold">Δ</th>
                  <th className="font-semibold">Avisos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {balance.map((d) => (
                  <tr key={d.day}>
                    <td className="py-2 pr-3 capitalize">
                      {new Date(`${d.day}T12:00:00Z`).toLocaleDateString("es-ES", { weekday: "short", day: "numeric" })}
                    </td>
                    <td className="tabular-nums">{d.clocked ? formatDuration(d.clocked) : "—"}</td>
                    <td className="tabular-nums">{d.tracked ? formatDuration(d.tracked) : "—"}</td>
                    <td className="tabular-nums">{d.meetings ? formatDuration(d.meetings) : "—"}</td>
                    <td className={`tabular-nums font-semibold ${d.expected && d.delta !== null ? (Math.abs(d.delta) <= 30 ? "" : d.delta > 0 ? "text-plum dark:text-peach" : "text-red") : "text-muted"}`}>
                      {d.expected && d.delta !== null ? `${d.delta > 0 ? "+" : ""}${formatDuration(d.delta)}` : "—"}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1 whitespace-normal">
                        {d.flags.map((f) => (
                          <span key={f} className="rounded-md bg-red px-1.5 py-0.5 text-[10px] font-bold text-white">{FLAG_LABEL[f]}</span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
