import { TZDate } from "@date-fns/tz";
import type { ActivityType, CalendarEvent } from "@/lib/types";
import { TIMEZONE, dayKey } from "@/lib/time";
import { moduleFor } from "@/modules/core/registry";

export interface SmartAlert {
  /** Estable por evento y tipo: sirve para no avisar dos veces. */
  id: string;
  kind: "tight" | "conflict";
  eventId: string;
  title: string;
  body: string;
  /** Propuesta de nuevo horario (mismo día, tras la última reunión + margen), si cabe. */
  suggestion: { start: string; end: string } | null;
}

const ms = (iso: string) => Date.parse(iso);
const hhmm = (iso: string, tz: string) => new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: tz });

/**
 * Detecta actividades flexibles (gym) que chocan con reuniones o que quedan demasiado justas
 * después de la última reunión del día ("sales a las 18:10, ¿mantienes el gym a las 19?").
 */
export function computeSmartAlerts(input: {
  events: CalendarEvent[];
  types: ActivityType[];
  now?: Date;
  /** Margen mínimo entre el fin de una reunión y el gym (desplazamiento, cambiarse…). */
  bufferMinutes?: number;
  horizonHours?: number;
  latestHour?: number;
  tz?: string;
}): SmartAlert[] {
  const { events, types, now = new Date(), bufferMinutes = 60, horizonHours = 48, latestHour = 22, tz = TIMEZONE } = input;
  const typeById = new Map(types.map((t) => [t.id, t]));
  const isMeeting = (e: CalendarEvent) => {
    const t = e.activity_type_id ? typeById.get(e.activity_type_id) : undefined;
    return !e.all_day && e.status !== "cancelled" && (e.source !== "local" || t?.module === "work" || t?.module === "appointments");
  };
  const out: SmartAlert[] = [];

  for (const e of events) {
    const type = e.activity_type_id ? typeById.get(e.activity_type_id) : undefined;
    if (!moduleFor(type).flexible || type?.module !== "gym") continue;
    if (e.source !== "local" || e.all_day || e.status !== "planned" || e.metadata?.alertDismissed) continue;
    const start = ms(e.starts_at);
    if (start < now.getTime() || start > now.getTime() + horizonHours * 3600000) continue;

    const sameDay = events.filter((m) => m.id !== e.id && isMeeting(m) && dayKey(m.starts_at, tz) === dayKey(e.starts_at, tz));
    const overlapping = sameDay.filter((m) => ms(m.starts_at) < ms(e.ends_at) && ms(m.ends_at) > start);
    const before = sameDay.filter((m) => ms(m.ends_at) <= start).sort((a, b) => ms(b.ends_at) - ms(a.ends_at))[0];
    const gap = before ? (start - ms(before.ends_at)) / 60000 : Infinity;

    let kind: SmartAlert["kind"] | null = null;
    let anchor: CalendarEvent | undefined;
    if (overlapping.length) {
      kind = "conflict";
      anchor = overlapping.sort((a, b) => ms(b.ends_at) - ms(a.ends_at))[0];
    } else if (gap < bufferMinutes) {
      kind = "tight";
      anchor = before;
    }
    if (!kind || !anchor) continue;

    // Propuesta: tras la última reunión que termine antes del cierre, + margen, redondeado a 15 min, sin pisar nada.
    const duration = ms(e.ends_at) - start;
    const lastEnd = Math.max(ms(anchor.ends_at), ...sameDay.filter((m) => ms(m.ends_at) > ms(anchor!.ends_at) && ms(m.starts_at) < ms(anchor!.ends_at) + bufferMinutes * 60000).map((m) => ms(m.ends_at)));
    let candidate = Math.ceil((lastEnd + bufferMinutes * 60000) / 900000) * 900000;
    const local = new TZDate(start, tz);
    const close = new TZDate(local.getFullYear(), local.getMonth(), local.getDate(), latestHour, 0, 0, tz).getTime();
    const busy = sameDay.concat(events.filter((x) => x.id !== e.id && x.source === "local" && !x.all_day && x.status !== "cancelled"));
    for (let guard = 0; guard < 40; guard++) {
      const clash = busy.find((m) => ms(m.starts_at) < candidate + duration && ms(m.ends_at) > candidate);
      if (!clash) break;
      candidate = Math.ceil((ms(clash.ends_at) + bufferMinutes * 60000) / 900000) * 900000;
    }
    const suggestion =
      candidate + duration <= close && candidate !== start
        ? { start: new Date(candidate).toISOString(), end: new Date(candidate + duration).toISOString() }
        : null;

    const gymAt = hhmm(e.starts_at, tz);
    out.push({
      id: `${kind}:${e.id}:${e.starts_at}`,
      kind,
      eventId: e.id,
      title: kind === "conflict" ? `«${anchor.title}» pisa tu ${e.title.toLowerCase()}` : `El ${e.title.toLowerCase()} te queda muy justo`,
      body:
        kind === "conflict"
          ? `Tienes «${anchor.title}» hasta las ${hhmm(anchor.ends_at, tz)} y el ${e.title.toLowerCase()} a las ${gymAt}.${suggestion ? ` ¿Lo pasamos a las ${hhmm(suggestion.start, tz)}?` : " Hoy ya no queda hueco: muévelo a otro día."}`
          : `Sales de «${anchor.title}» a las ${hhmm(anchor.ends_at, tz)}, ¿mantienes el ${e.title.toLowerCase()} a las ${gymAt}?`,
      suggestion,
    });
  }
  return out;
}
