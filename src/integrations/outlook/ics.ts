import "server-only";
import ical from "node-ical";

export interface IcsOccurrence {
  uid: string;
  title: string;
  location: string | null;
  start: string;
  end: string;
  allDay: boolean;
  cancelled: boolean;
}

/**
 * Descarga y expande un calendario ICS publicado (Outlook → Configuración → Calendarios compartidos
 * → Publicar calendario). Solo lectura. Las recurrencias se expanden en [from, to].
 */
export async function fetchIcs(url: string, from: Date, to: Date): Promise<IcsOccurrence[]> {
  const parsed = new URL(url.replace(/^webcal:/i, "https:"));
  const local = ["localhost", "127.0.0.1"].includes(parsed.hostname) && process.env.NODE_ENV !== "production";
  if (parsed.protocol !== "https:" && !local) throw new Error("La URL ICS debe ser https");
  const res = await fetch(parsed, { headers: { Accept: "text/calendar" } });
  if (!res.ok) throw new Error(`ICS ${res.status}`);
  return expandIcs(await res.text(), from, to);
}

export function expandIcs(text: string, from: Date, to: Date): IcsOccurrence[] {
  const data = ical.sync.parseICS(text);
  const out: IcsOccurrence[] = [];
  for (const item of Object.values(data)) {
    if (!item || item.type !== "VEVENT") continue;
    const ev = item as ical.VEvent;
    const durationMs = ev.end ? ev.end.getTime() - ev.start.getTime() : 3600000;
    const allDay = ev.datetype === "date";
    const title = typeof ev.summary === "string" ? ev.summary : (ev.summary as { val?: string })?.val ?? "(sin asunto)";
    const location = typeof ev.location === "string" ? ev.location : null;
    const cancelled = ev.status === "CANCELLED";
    const push = (start: Date, key: string) =>
      out.push({
        uid: key,
        title,
        location,
        start: start.toISOString(),
        end: new Date(start.getTime() + durationMs).toISOString(),
        allDay,
        cancelled,
      });

    if (ev.rrule) {
      const exdates = new Set(Object.values(ev.exdate ?? {}).map((d) => new Date(d as Date).getTime()));
      for (const occ of ev.rrule.between(from, to, true)) {
        if (exdates.has(occ.getTime())) continue;
        const override = ev.recurrences?.[occ.toISOString().slice(0, 10)];
        if (override) continue; // se añade como instancia propia abajo
        push(occ, `${ev.uid}_${occ.toISOString()}`);
      }
      for (const r of Object.values(ev.recurrences ?? {})) {
        if (r.start >= from && r.start <= to) push(r.start, `${ev.uid}_${r.start.toISOString()}`);
      }
    } else if (ev.start <= to && new Date(ev.start.getTime() + durationMs) >= from) {
      push(ev.start, ev.uid);
    }
  }
  return out;
}
