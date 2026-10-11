import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import type { CalendarEvent, Pause, TimeSession } from "@/lib/types";

export const TIMEZONE = process.env.NEXT_PUBLIC_TIMEZONE || "Europe/Madrid";

const ms = (iso: string) => new Date(iso).getTime();

/** Minutos efectivos de una sesión (descontando pausas). Si está abierta, cuenta hasta `now`. */
export function sessionMinutes(
  s: Pick<TimeSession, "started_at" | "ended_at" | "pauses">,
  now: Date = new Date(),
): number {
  const end = s.ended_at ? ms(s.ended_at) : now.getTime();
  const total = Math.max(0, end - ms(s.started_at));
  return Math.round((total - pausedMs(s.pauses, end)) / 60000);
}

export function pausedMs(pauses: Pause[], until: number): number {
  return pauses.reduce((acc, p) => {
    const pe = p.end ? ms(p.end) : until;
    return acc + Math.max(0, Math.min(pe, until) - ms(p.start));
  }, 0);
}

export function isPaused(s: Pick<TimeSession, "pauses" | "ended_at">): boolean {
  return !s.ended_at && s.pauses.some((p) => p.end === null);
}

export function eventMinutes(e: Pick<CalendarEvent, "starts_at" | "ends_at">): number {
  return Math.round((ms(e.ends_at) - ms(e.starts_at)) / 60000);
}

export function overlapMinutes(aStart: string, aEnd: string, bStart: string, bEnd: string): number {
  const o = Math.min(ms(aEnd), ms(bEnd)) - Math.max(ms(aStart), ms(bStart));
  return Math.max(0, Math.round(o / 60000));
}

/** Clave de día (yyyy-MM-dd) en la zona horaria del usuario. */
export function dayKey(iso: string | Date, tz = TIMEZONE): string {
  return format(new TZDate(new Date(iso).getTime(), tz), "yyyy-MM-dd");
}

export function formatDuration(minutes: number): string {
  const sign = minutes < 0 ? "-" : "";
  const m = Math.abs(minutes);
  const h = Math.floor(m / 60);
  return h ? `${sign}${h}h ${String(m % 60).padStart(2, "0")}m` : `${sign}${m % 60}m`;
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/**
 * Busca el evento planificado al que pertenece una sesión de cronómetro:
 * mismo tipo de actividad y cuyo horario se solape o empiece cerca (±90 min) del inicio real.
 */
export function matchEventForSession(
  session: Pick<TimeSession, "activity_type_id" | "started_at">,
  events: Pick<CalendarEvent, "id" | "activity_type_id" | "starts_at" | "ends_at" | "status">[],
  windowMinutes = 90,
): string | null {
  const start = ms(session.started_at);
  let best: { id: string; dist: number } | null = null;
  for (const e of events) {
    if (e.activity_type_id !== session.activity_type_id) continue;
    if (e.status === "cancelled" || e.status === "done") continue;
    const es = ms(e.starts_at);
    const ee = ms(e.ends_at);
    const dist = start >= es && start <= ee ? 0 : Math.abs(start - es) / 60000;
    if (dist <= windowMinutes && (!best || dist < best.dist)) best = { id: e.id, dist };
  }
  return best?.id ?? null;
}
