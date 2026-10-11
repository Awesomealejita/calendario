import type { Pause } from "@/lib/types";

/**
 * Registro de fichaje tal y como lo devuelve la Team API de Holded.
 * La API no está totalmente documentada públicamente: aceptamos varias formas
 * (timestamps Unix en segundos o ISO, `start`/`startTmp`, `end`/`endTmp`, pausas opcionales).
 */
export type HoldedTime = Record<string, unknown> & { id?: string; _id?: string };

function toIso(v: unknown): string | null {
  if (v === null || v === undefined || v === "" || v === 0) return null;
  if (typeof v === "number") return new Date(v < 1e12 ? v * 1000 : v).toISOString();
  if (typeof v === "string") {
    if (/^\d+$/.test(v)) return toIso(Number(v));
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

const pick = (o: Record<string, unknown>, keys: string[]) => keys.map((k) => o[k]).find((v) => v !== undefined && v !== null);

export function holdedTimeToSession(t: HoldedTime, userId: string, workTypeId: string | null) {
  const id = String(t.id ?? t._id ?? "");
  const start = toIso(pick(t, ["startTmp", "start", "startDate", "clockIn", "date"]));
  if (!id || !start) return null;
  const end = toIso(pick(t, ["endTmp", "end", "endDate", "clockOut"]));
  const rawPauses = (pick(t, ["pauses", "breaks"]) as Array<Record<string, unknown>> | undefined) ?? [];
  const pauses: Pause[] = rawPauses
    .map((p) => ({ start: toIso(pick(p, ["startTmp", "start"])), end: toIso(pick(p, ["endTmp", "end"])) }))
    .filter((p): p is Pause => p.start !== null);
  return {
    user_id: userId,
    activity_type_id: workTypeId,
    source: "holded" as const,
    external_id: id,
    started_at: start,
    ended_at: end,
    pauses,
  };
}
