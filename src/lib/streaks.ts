import { addDays } from "date-fns";
import type { ActivityType, TimeSession } from "@/lib/types";
import type { DayBalance } from "@/lib/reconcile";
import { TIMEZONE, countedMinutes, dayKey } from "@/lib/time";
import { weekBounds } from "@/ai/adherence";

export interface WeekStat {
  weekStart: string; // yyyy-MM-dd (lunes)
  sessions: number;
  minutes: number;
  met: boolean;
  current: boolean;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  /** 0–1 para mostrar progreso hacia el logro. */
  progress: number;
}

/** Sesiones de un tipo de actividad agrupadas por semana (lunes–domingo), de la más antigua a la actual. */
export function weeklyHistory(
  type: Pick<ActivityType, "id" | "weekly_goal_sessions" | "weekly_goal_minutes">,
  sessions: TimeSession[],
  now: Date,
  weeks = 12,
  tz = TIMEZONE,
): WeekStat[] {
  const out: WeekStat[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const { start, end, days } = weekBounds(addDays(now, -7 * i), tz);
    const ws = sessions.filter(
      (s) => s.activity_type_id === type.id && s.source === "timer" && Date.parse(s.started_at) >= start.getTime() && Date.parse(s.started_at) < end.getTime(),
    );
    const minutes = ws.reduce((a, s) => a + countedMinutes(s, now, tz), 0);
    const met =
      (type.weekly_goal_sessions ? ws.length >= type.weekly_goal_sessions : true) &&
      (type.weekly_goal_minutes ? minutes >= type.weekly_goal_minutes : true) &&
      Boolean(type.weekly_goal_sessions || type.weekly_goal_minutes);
    out.push({ weekStart: days[0], sessions: ws.length, minutes, met, current: i === 0 });
  }
  return out;
}

/**
 * Racha de semanas seguidas cumpliendo el objetivo. La semana actual suma si ya está cumplida,
 * pero no rompe la racha mientras siga en curso.
 */
export function weekStreak(history: WeekStat[]): number {
  let streak = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const w = history[i];
    if (w.met) streak++;
    else if (!w.current) break;
  }
  return streak;
}

/** Días laborables seguidos (hasta ayer) con fichaje correcto: fichado y sin fichajes abiertos. */
export function perfectClockStreak(balances: DayBalance[], now: Date, tz = TIMEZONE): number {
  const today = dayKey(now, tz);
  const past = balances.filter((d) => d.day < today && d.expected > 0).sort((a, b) => b.day.localeCompare(a.day));
  let streak = 0;
  for (const d of past) {
    if (d.clocked > 0 && !d.flags.includes("no_clock") && !d.flags.includes("open_clock")) streak++;
    else break;
  }
  return streak;
}

export function achievements(input: {
  totalGymSessions: number;
  totalGymMinutes: number;
  gymStreak: number;
  bestGymStreak: number;
  clockStreak: number;
  totalSets: number;
}): Achievement[] {
  const a = (id: string, title: string, description: string, value: number, target: number): Achievement => ({
    id,
    title,
    description,
    unlocked: value >= target,
    progress: Math.min(1, value / target),
  });
  return [
    a("first", "Primer paso", "Completa tu primera sesión de gym", input.totalGymSessions, 1),
    a("ten", "Constancia", "10 sesiones de gym", input.totalGymSessions, 10),
    a("fifty", "Imparable", "50 sesiones de gym", input.totalGymSessions, 50),
    a("streak4", "Un mes sin fallar", "4 semanas seguidas cumpliendo tu objetivo", input.bestGymStreak, 4),
    a("hours20", "20 horas de entreno", "Suma 20 h de gym", input.totalGymMinutes, 1200),
    a("sets100", "Cien series", "Registra 100 series", input.totalSets, 100),
    a("clock5", "Semana impecable", "5 días laborables seguidos con fichaje correcto", input.clockStreak, 5),
  ];
}

/** Mejor racha histórica en el periodo mostrado. */
export function bestStreak(history: WeekStat[]): number {
  let best = 0;
  let run = 0;
  for (const w of history) {
    run = w.met ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}
