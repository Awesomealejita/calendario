import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addHours } from "date-fns";
import type { ActivityType, CalendarEvent, TimeSession } from "@/lib/types";
import { matchEventForSession } from "@/lib/time";
import { holdedFor } from "@/integrations/holded/sync";

/**
 * Cronómetro persistido en BD: sobrevive a cerrar la PWA o cambiar de dispositivo.
 * Para el módulo de trabajo puede fichar a la vez en Holded.
 */
export async function startTimer(db: SupabaseClient, userId: string, activityTypeId: string, opts: { holded?: boolean } = {}) {
  const now = new Date();
  const { data: type } = await db.from("activity_types").select("*").eq("id", activityTypeId).single<ActivityType>();
  if (!type) throw new Error("Tipo de actividad no encontrado");

  const { data: events } = await db
    .from("events")
    .select("id, activity_type_id, starts_at, ends_at, status")
    .eq("activity_type_id", activityTypeId)
    .gte("ends_at", addHours(now, -3).toISOString())
    .lte("starts_at", addHours(now, 3).toISOString());
  const eventId = matchEventForSession({ activity_type_id: activityTypeId, started_at: now.toISOString() }, (events ?? []) as CalendarEvent[]);

  const { data, error } = await db
    .from("time_sessions")
    .insert({ user_id: userId, activity_type_id: activityTypeId, event_id: eventId, started_at: now.toISOString(), source: "timer" })
    .select()
    .single<TimeSession>();
  if (error) throw error.code === "23505" ? new Error("Ya hay un cronómetro en marcha para esta actividad") : error;

  const warning = opts.holded && type.module === "work" ? await holdedAction(db, userId, "clockIn") : null;
  return { session: data, warning };
}

export async function togglePause(db: SupabaseClient, userId: string, sessionId: string, opts: { holded?: boolean } = {}) {
  const s = await getOpen(db, sessionId);
  const now = new Date().toISOString();
  const open = s.pauses.find((p) => p.end === null);
  const pauses = open ? s.pauses.map((p) => (p === open ? { ...p, end: now } : p)) : [...s.pauses, { start: now, end: null }];
  const { error } = await db.from("time_sessions").update({ pauses }).eq("id", sessionId);
  if (error) throw error;
  return opts.holded && (await isWork(db, s)) ? holdedAction(db, userId, open ? "unpause" : "pause") : null;
}

export async function stopTimer(db: SupabaseClient, userId: string, sessionId: string, opts: { holded?: boolean; notes?: string } = {}) {
  const s = await getOpen(db, sessionId);
  const now = new Date().toISOString();
  const pauses = s.pauses.map((p) => (p.end ? p : { ...p, end: now }));
  const { error } = await db.from("time_sessions").update({ ended_at: now, pauses, notes: opts.notes ?? s.notes }).eq("id", sessionId);
  if (error) throw error;
  if (s.event_id) await db.from("events").update({ status: "done" }).eq("id", s.event_id);
  return opts.holded && (await isWork(db, s)) ? holdedAction(db, userId, "clockOut") : null;
}

async function getOpen(db: SupabaseClient, id: string) {
  const { data } = await db.from("time_sessions").select("*").eq("id", id).is("ended_at", null).single<TimeSession>();
  if (!data) throw new Error("La sesión ya está cerrada");
  return data;
}

async function isWork(db: SupabaseClient, s: TimeSession) {
  if (!s.activity_type_id) return false;
  const { data } = await db.from("activity_types").select("module").eq("id", s.activity_type_id).single();
  return data?.module === "work";
}

/** El fichaje en Holded nunca bloquea el cronómetro local: devuelve un aviso si falla. */
async function holdedAction(
  db: SupabaseClient,
  userId: string,
  action: "clockIn" | "clockOut" | "pause" | "unpause",
): Promise<string | null> {
  try {
    const h = await holdedFor(db, userId);
    if (!h) return "Holded no está configurado (Ajustes → Holded): no se ha fichado.";
    await h.client[action](h.employeeId);
    return null;
  } catch (e) {
    return `No se pudo fichar en Holded: ${(e as Error).message}`;
  }
}
