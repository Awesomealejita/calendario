import type { Achievement, WeekStat } from "@/lib/streaks";

/** Gráfico de barras de sesiones por semana con la línea del objetivo (SVG, sin dependencias). */
function WeeksChart({ weeks, goal }: { weeks: WeekStat[]; goal: number | null }) {
  const W = 320;
  const H = 120;
  const pad = { top: 14, bottom: 18, left: 4, right: 4 };
  const max = Math.max(goal ?? 0, ...weeks.map((w) => w.sessions), 1);
  const bw = (W - pad.left - pad.right) / weeks.length;
  const y = (v: number) => pad.top + (H - pad.top - pad.bottom) * (1 - v / max);
  const label = (w: WeekStat) =>
    `Semana del ${new Date(`${w.weekStart}T12:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}: ${w.sessions} sesiones${w.current ? " (en curso)" : ""}${w.met ? " · objetivo cumplido" : ""}`;
  return (
    <figure className="mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Sesiones de gym por semana, últimas 12 semanas">
        <line x1={pad.left} x2={W - pad.right} y1={H - pad.bottom} y2={H - pad.bottom} stroke="var(--border)" strokeWidth="1" />
        {weeks.map((w, i) => {
          const x = pad.left + i * bw;
          const top = y(w.sessions);
          const h = H - pad.bottom - top;
          return (
            <g key={w.weekStart}>
              <title>{label(w)}</title>
              {/* Zona de hover más grande que la barra. */}
              <rect x={x} y={pad.top} width={bw} height={H - pad.top - pad.bottom} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${x + 2},${H - pad.bottom} V${top + 4} q0,-4 4,-4 H${x + bw - 6} q4,0 4,4 V${H - pad.bottom} Z`}
                  fill="var(--chart-bar)"
                  opacity={w.current ? 0.45 : 1}
                />
              )}
              {w.met && <circle cx={x + bw / 2} cy={top - 6} r="2.5" fill="var(--text)" />}
              {(i === 0 || i === weeks.length - 1 || i % 4 === 0) && (
                <text x={x + bw / 2} y={H - 4} textAnchor="middle" fontSize="9" fill="var(--muted)">
                  {w.current ? "esta" : new Date(`${w.weekStart}T12:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "numeric" })}
                </text>
              )}
            </g>
          );
        })}
        {goal ? (
          <>
            <line x1={pad.left} x2={W - pad.right} y1={y(goal)} y2={y(goal)} stroke="var(--text)" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.6" />
            <text x={W - pad.right} y={y(goal) - 4} textAnchor="end" fontSize="9" fill="var(--muted)">objetivo {goal}/sem</text>
          </>
        ) : null}
      </svg>
      <figcaption className="sr-only">
        <table>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.weekStart}><td>{label(w)}</td></tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}

export function StreaksCard({
  gymStreak,
  clockStreak,
  weeks,
  goal,
  list,
}: {
  gymStreak: number;
  clockStreak: number;
  weeks: WeekStat[];
  goal: number | null;
  list: Achievement[];
}) {
  const unlocked = list.filter((a) => a.unlocked).length;
  return (
    <section className="card">
      <h2 className="font-bold">Rachas y logros</h2>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-surface-2 p-3">
          <p className="text-3xl font-extrabold tabular-nums">{gymStreak}</p>
          <p className="text-sm text-muted">{gymStreak === 1 ? "semana seguida" : "semanas seguidas"} cumpliendo el gym</p>
        </div>
        <div className="rounded-xl bg-surface-2 p-3">
          <p className="text-3xl font-extrabold tabular-nums">{clockStreak}</p>
          <p className="text-sm text-muted">{clockStreak === 1 ? "día" : "días"} seguidos con el fichaje perfecto</p>
        </div>
      </div>
      <WeeksChart weeks={weeks} goal={goal} />
      <h3 className="mt-4 text-sm font-semibold">Logros · {unlocked}/{list.length}</h3>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {list.map((a) => (
          <li key={a.id} className={`rounded-xl border p-3 ${a.unlocked ? "border-transparent bg-peach/40" : "border-border"}`}>
            <p className={`text-sm font-semibold ${a.unlocked ? "" : "text-muted"}`}>
              <span aria-hidden>{a.unlocked ? "★ " : "☆ "}</span>
              {a.title}
              <span className="sr-only">{a.unlocked ? " (conseguido)" : " (pendiente)"}</span>
            </p>
            <p className="text-xs text-muted">{a.description}</p>
            {!a.unlocked && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(a.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Progreso: ${a.title}`}>
                <div className="h-full rounded-full bg-[var(--chart-bar)]" style={{ width: `${a.progress * 100}%` }} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
