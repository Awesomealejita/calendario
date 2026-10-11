import { addDays, startOfWeek } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { MODULES, moduleFor } from "@/modules/core/registry";
import type { ActivityType, CalendarEvent, Task, TimeSession } from "@/lib/types";
import { TIMEZONE, dayKey, eventMinutes, sessionMinutes } from "@/lib/time";
import { reconcileWork, type DayBalance } from "@/lib/reconcile";

export type IssueKind =
  | "missed"
  | "late_start"
  | "short_session"
  | "weekly_goal_behind"
  | "work_balance"
  | "overdue_task";

export interface Issue {
  kind: IssueKind;
  severity: "low" | "medium" | "high";
  message: string;
  eventId?: string;
  activityTypeId?: string;
  data?: Record<string, unknown>;
}

export interface FreeSlot {
  start: string;
  end: string;
  minutes: number;
}

export interface AdherenceReport {
  generatedAt: string;
  issues: Issue[];
  /** Eventos que deben pasar a estado "missed". */
  missedEventIds: string[];
  weekly: Array<{ activityTypeId: string; name: string; sessions: number; minutes: number; goalSessions: number | null; goalMinutes: number | null }>;
  workBalance: DayBalance[];
  freeSlots: FreeSlot[];
}

const ms = (iso: string) => new Date(iso).getTime();

export function weekBounds(now: Date, tz = TIMEZONE): { start: Date; end: Date; days: string[] } {
  const start = startOfWeek(new TZDate(now.getTime(), tz), { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => dayKey(addDays(start, i), tz));
  return { start: new Date(start.getTime()), end: new Date(addDays(start, 7).getTime()), days };
}

/**
 * Huecos libres entre `dayStartHour` y `dayEndHour` (hora local) para los próximos `days` días.
 */
export function findFreeSlots(
  events: Pick<CalendarEvent, "starts_at" | "ends_at" | "all_day" | "status">[],
  now: Date,
  { days = 3, minMinutes = 45, dayStartHour = 7, dayEndHour = 22, tz = TIMEZONE } = {},
): FreeSlot[] {
  const busy = events
    .filter((e) => !e.all_day && e.status !== "cancelled")
    .map((e) => [ms(e.starts_at), ms(e.ends_at)] as const)
    .sort((a, b) => a[0] - b[0]);
  const slots: FreeSlot[] = [];
  const base = new TZDate(now.getTime(), tz);
  for (let i = 0; i < days; i++) {
    const d = addDays(base, i);
    const open = new TZDate(d.getFullYear(), d.getMonth(), d.getDate(), dayStartHour, 0, 0, tz).getTime();
    const close = new TZDate(d.getFullYear(), d.getMonth(), d.getDate(), dayEndHour, 0, 0, tz).getTime();
    let cursor = Math.max(open, now.getTime());
    for (const [s, e] of busy) {
      if (e <= cursor || s >= close) continue;
      if (s > cursor) push(cursor, Math.min(s, close));
      cursor = Math.max(cursor, e);
    }
    if (cursor < close) push(cursor, close);
  }
  function push(s: number, e: number) {
    const minutes = Math.floor((e - s) / 60000);
    if (minutes >= minMinutes) slots.push({ start: new Date(s).toISOString(), end: new Date(e).toISOString(), minutes });
  }
  return slots;
}

/**
 * Motor determinista: detecta incumplimientos y desajustes. La IA solo redacta y prioriza
 * a partir de este informe, así las sugerencias se basan en datos reales.
 */
export function analyzeAdherence(input: {
  types: ActivityType[];
  events: CalendarEvent[];
  sessions: TimeSession[];
  tasks: Task[];
  now?: Date;
}): AdherenceReport {
  const { types, events, sessions, tasks, now = new Date() } = input;
  const typeById = new Map(types.map((t) => [t.id, t]));
  const issues: Issue[] = [];
  const missedEventIds: string[] = [];
  const nowMs = now.getTime();

  // 1) Eventos con cronómetro no acudidos / tarde / cortos.
  for (const e of events) {
    const type = e.activity_type_id ? typeById.get(e.activity_type_id) : undefined;
    const mod = moduleFor(type);
    if (!mod.timer || mod.missedGraceMinutes == null || e.source !== "local") continue;
    if (e.status === "cancelled" || e.status === "moved") continue;
    const linked = sessions.filter((s) => s.event_id === e.id);
    const graceEnd = ms(e.starts_at) + mod.missedGraceMinutes * 60000;

    if (!linked.length && e.status === "planned" && graceEnd < nowMs) {
      missedEventIds.push(e.id);
      issues.push({
        kind: "missed",
        severity: mod.key === "gym" ? "high" : "medium",
        message: `No consta que hayas hecho "${e.title}" (${dayKey(e.starts_at)}).`,
        eventId: e.id,
        activityTypeId: e.activity_type_id ?? undefined,
      });
      continue;
    }
    if (!linked.length) continue;
    const first = linked.reduce((a, b) => (ms(a.started_at) < ms(b.started_at) ? a : b));
    const lateBy = Math.round((ms(first.started_at) - ms(e.starts_at)) / 60000);
    if (lateBy > 15) {
      issues.push({
        kind: "late_start",
        severity: lateBy > 45 ? "medium" : "low",
        message: `Empezaste "${e.title}" ${lateBy} min tarde.`,
        eventId: e.id,
        data: { lateBy },
      });
    }
    const done = linked.reduce((a, s) => a + sessionMinutes(s, now), 0);
    const plan = eventMinutes(e);
    if (linked.every((s) => s.ended_at) && plan > 0 && done < plan * 0.7) {
      issues.push({
        kind: "short_session",
        severity: "low",
        message: `"${e.title}": ${done} de ${plan} min planificados.`,
        eventId: e.id,
        data: { done, plan },
      });
    }
  }

  // 2) Objetivos semanales (p. ej. gym 4 sesiones / 240 min).
  const { start, end, days } = weekBounds(now);
  const daysLeft = Math.max(0, Math.ceil((end.getTime() - nowMs) / 86400000));
  const weekly = types
    .filter((t) => t.weekly_goal_sessions || t.weekly_goal_minutes)
    .map((t) => {
      const ws = sessions.filter(
        (s) => s.activity_type_id === t.id && ms(s.started_at) >= start.getTime() && ms(s.started_at) < end.getTime(),
      );
      return {
        activityTypeId: t.id,
        name: t.name,
        sessions: ws.length,
        minutes: ws.reduce((a, s) => a + sessionMinutes(s, now), 0),
        goalSessions: t.weekly_goal_sessions,
        goalMinutes: t.weekly_goal_minutes,
      };
    });
  const workTypeIds = new Set(types.filter((t) => t.module === "work").map((t) => t.id));
  for (const w of weekly) {
    if (workTypeIds.has(w.activityTypeId)) continue; // el trabajo se mide con el cuadre diario
    const missingSessions = (w.goalSessions ?? 0) - w.sessions;
    if (missingSessions > 0 && missingSessions >= daysLeft) {
      issues.push({
        kind: "weekly_goal_behind",
        severity: missingSessions > daysLeft ? "high" : "medium",
        message: `${w.name}: llevas ${w.sessions}/${w.goalSessions} sesiones y quedan ${daysLeft} días.`,
        activityTypeId: w.activityTypeId,
        data: { missingSessions, daysLeft },
      });
    }
  }

  // 3) Cuadre de trabajo (Holded vs. Outlook vs. plan).
  const workBalance = reconcileWork({ days, types, events, sessions, now });
  for (const d of workBalance) {
    if (!d.flags.length) continue;
    const parts: string[] = [];
    if (d.flags.includes("no_clock")) parts.push("sin fichaje");
    if (d.flags.includes("open_clock")) parts.push("fichaje sin cerrar");
    if (d.flags.includes("overtime")) parts.push(`+${d.delta} min sobre la jornada`);
    if (d.flags.includes("short")) parts.push(`${d.delta} min respecto a la jornada`);
    if (d.flags.includes("meetings_outside")) parts.push(`${d.meetingsOutsideClock} min de reuniones fuera del fichaje`);
    issues.push({
      kind: "work_balance",
      severity: d.flags.includes("no_clock") || d.flags.includes("open_clock") ? "high" : "medium",
      message: `${d.day}: ${parts.join(", ")}.`,
      data: { ...d },
    });
  }

  // 4) Quehaceres vencidos.
  for (const t of tasks) {
    if (!t.done && t.due_at && ms(t.due_at) < nowMs) {
      issues.push({ kind: "overdue_task", severity: "low", message: `Tarea vencida: "${t.title}".`, data: { taskId: t.id } });
    }
  }

  const upcoming = events.filter((e) => ms(e.ends_at) > nowMs);
  return {
    generatedAt: now.toISOString(),
    issues,
    missedEventIds,
    weekly,
    workBalance,
    freeSlots: findFreeSlots(upcoming, now),
  };
}

export { MODULES };
