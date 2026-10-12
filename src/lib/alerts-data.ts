import type { SupabaseClient } from "@supabase/supabase-js";
import { addHours } from "date-fns";
import { computeSmartAlerts } from "@/ai/alerts";
import type { ActivityType, CalendarEvent } from "@/lib/types";

/** Carga lo necesario y calcula los avisos de las próximas horas para un usuario. */
export async function loadSmartAlerts(db: SupabaseClient, userId: string, now = new Date()) {
  const [{ data: types }, { data: events }] = await Promise.all([
    db.from("activity_types").select("*").eq("user_id", userId),
    db
      .from("events")
      .select("*")
      .eq("user_id", userId)
      .gte("ends_at", addHours(now, -12).toISOString())
      .lte("starts_at", addHours(now, 60).toISOString()),
  ]);
  const evs = (events ?? []) as CalendarEvent[];
  return { alerts: computeSmartAlerts({ events: evs, types: (types ?? []) as ActivityType[], now }), events: evs };
}
