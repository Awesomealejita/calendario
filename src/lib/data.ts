import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActivityType, CalendarEvent, Task, TimeSession } from "@/lib/types";

export interface UserData {
  types: ActivityType[];
  events: CalendarEvent[];
  sessions: TimeSession[];
  tasks: Task[];
}

/** Carga todo lo necesario para analizar un rango (con RLS o con service role filtrando por user_id). */
export async function loadUserData(
  db: SupabaseClient,
  userId: string,
  from: Date,
  to: Date,
): Promise<UserData> {
  const [types, events, sessions, tasks] = await Promise.all([
    db.from("activity_types").select("*").eq("user_id", userId).order("created_at"),
    db
      .from("events")
      .select("*")
      .eq("user_id", userId)
      .lt("starts_at", to.toISOString())
      .gt("ends_at", from.toISOString())
      .order("starts_at"),
    db
      .from("time_sessions")
      .select("*")
      .eq("user_id", userId)
      .gte("started_at", from.toISOString())
      .lt("started_at", to.toISOString())
      .order("started_at"),
    db.from("tasks").select("*").eq("user_id", userId).eq("done", false),
  ]);
  for (const r of [types, events, sessions, tasks]) if (r.error) throw r.error;
  return {
    types: types.data as ActivityType[],
    events: events.data as CalendarEvent[],
    sessions: sessions.data as TimeSession[],
    tasks: tasks.data as Task[],
  };
}
