import type { ActivityType, CalendarEvent, TimeSession } from "@/lib/types";
import { countedMinutes, dayKey, eventMinutes, overlapMinutes } from "@/lib/time";

export interface DayBalance {
  day: string;
  /** Minutos fichados en Holded. */
  clocked: number;
  /** Minutos de cronómetro de trabajo en la app. */
  tracked: number;
  /** Minutos en reuniones (Outlook / ICS). */
  meetings: number;
  /** Reuniones fuera de los fichajes (minutos). */
  meetingsOutsideClock: number;
  /** Minutos de trabajo planificados en la app. */
  planned: number;
  /** Objetivo diario (objetivo semanal / 5 en días laborables). */
  expected: number;
  /** clocked - expected (o tracked si no hay fichajes). Null en días futuros. */
  delta: number | null;
  /** Día posterior a hoy: aún no hay nada que cuadrar. */
  future: boolean;
  flags: Array<"no_clock" | "overtime" | "short" | "meetings_outside" | "open_clock">;
}

/** Fin efectivo: un fichaje abierto de un día pasado no cubre nada (se avisa como "fichaje abierto"). */
const effectiveEnd = (s: TimeSession, now: Date) =>
  s.ended_at ?? (countedMinutes(s, now) > 0 ? now.toISOString() : s.started_at);

const isWeekday = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`).getUTCDay();
  return d !== 0 && d !== 6;
};

/**
 * Cuadre diario de horas de trabajo: fichajes Holded vs. cronómetro vs. reuniones vs. plan.
 */
export function reconcileWork(params: {
  days: string[];
  types: ActivityType[];
  events: CalendarEvent[];
  sessions: TimeSession[];
  now?: Date;
  toleranceMinutes?: number;
}): DayBalance[] {
  const { days, types, events, sessions, now = new Date(), toleranceMinutes = 30 } = params;
  const workIds = new Set(types.filter((t) => t.module === "work").map((t) => t.id));
  const workGoal = types.find((t) => t.module === "work")?.weekly_goal_minutes ?? 0;
  const today = dayKey(now);

  return days.map((day) => {
    const holded = sessions.filter((s) => s.source === "holded" && dayKey(s.started_at) === day);
    const timer = sessions.filter(
      (s) => s.source === "timer" && s.activity_type_id && workIds.has(s.activity_type_id) && dayKey(s.started_at) === day,
    );
    const dayEvents = events.filter((e) => !e.all_day && e.status !== "cancelled" && dayKey(e.starts_at) === day);
    const meetingsEv = dayEvents.filter((e) => e.source !== "local");
    const plannedEv = dayEvents.filter((e) => e.source === "local" && e.activity_type_id && workIds.has(e.activity_type_id));

    const clocked = holded.reduce((a, s) => a + countedMinutes(s, now), 0);
    const tracked = timer.reduce((a, s) => a + countedMinutes(s, now), 0);
    const meetings = meetingsEv.reduce((a, e) => a + eventMinutes(e), 0);
    const planned = plannedEv.reduce((a, e) => a + eventMinutes(e), 0);
    const meetingsOutsideClock = holded.length
      ? meetingsEv.reduce((a, e) => {
          const covered = holded.reduce(
            (c, s) => c + overlapMinutes(e.starts_at, e.ends_at, s.started_at, effectiveEnd(s, now)),
            0,
          );
          return a + Math.max(0, eventMinutes(e) - covered);
        }, 0)
      : 0;
    const expected = isWeekday(day) && workGoal ? Math.round(workGoal / 5) : 0;
    const actual = holded.length ? clocked : tracked;
    const future = day > today;
    const delta = future ? null : actual - expected;

    const flags: DayBalance["flags"] = [];
    const finished = day < today;
    if (holded.some((s) => !s.ended_at) && finished) flags.push("open_clock");
    // Hoy solo se avisa de "sin fichar" si ya ha empezado alguna reunión.
    const meetingStarted = meetingsEv.some((e) => new Date(e.starts_at) <= now);
    if (expected && !holded.length && (finished || (day === today && meetingStarted))) flags.push("no_clock");
    if (expected && finished && actual && delta !== null && delta > toleranceMinutes) flags.push("overtime");
    if (expected && finished && actual && delta !== null && delta < -toleranceMinutes) flags.push("short");
    if (meetingsOutsideClock > 15) flags.push("meetings_outside");

    return { day, clocked, tracked, meetings, meetingsOutsideClock, planned, expected, delta, future, flags };
  });
}
