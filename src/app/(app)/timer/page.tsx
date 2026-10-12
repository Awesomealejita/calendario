import { addDays, startOfDay } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { TIMEZONE } from "@/lib/time";
import { TimerBoard } from "@/components/TimerBoard";
import { requireUser } from "@/lib/supabase/server";
import type { ActivityType, CalendarEvent, TimeSession, WorkoutSet } from "@/lib/types";
import { sessionMinutes } from "@/lib/time";
import { SmartAlerts } from "@/components/SmartAlerts";
import { loadSmartAlerts } from "@/lib/alerts-data";

export const dynamic = "force-dynamic";

export default async function TimerPage() {
  const { supabase, user } = await requireUser();
  const now = new Date();
  const [types, open, today, next, holded] = await Promise.all([
    supabase.from("activity_types").select("*").eq("has_timer", true).order("created_at"),
    supabase.from("time_sessions").select("*").is("ended_at", null).eq("source", "timer"),
    supabase.from("time_sessions").select("*").gte("started_at", startOfDay(new TZDate(now.getTime(), TIMEZONE)).toISOString()).order("started_at", { ascending: false }),
    supabase
      .from("events")
      .select("*")
      .eq("status", "planned")
      .eq("source", "local")
      .gte("ends_at", now.toISOString())
      .lte("starts_at", addDays(now, 3).toISOString())
      .order("starts_at"),
    supabase.from("integrations").select("config").eq("provider", "holded").maybeSingle(),
  ]);
  // Registro de entreno: la sesión de gym abierta, o la última terminada hoy.
  const gymType = ((types.data ?? []) as ActivityType[]).find((t) => t.module === "gym");
  const todaySessions = (today.data ?? []) as TimeSession[];
  const gymSession =
    ((open.data ?? []) as TimeSession[]).find((s) => s.activity_type_id === gymType?.id) ??
    todaySessions.find((s) => s.activity_type_id === gymType?.id && s.source === "timer");
  const [{ data: sets }, { data: recent }] = await Promise.all([
    gymSession
      ? supabase.from("workout_sets").select("*").eq("session_id", gymSession.id).order("created_at")
      : Promise.resolve({ data: [] }),
    supabase.from("workout_sets").select("exercise, reps, weight_kg").order("created_at", { ascending: false }).limit(200),
  ]);
  // Última serie de cada ejercicio (la consulta viene de más reciente a más antigua).
  const lastByExercise = new Map<string, WorkoutSet>();
  for (const r of (recent ?? []) as WorkoutSet[]) if (!lastByExercise.has(r.exercise.toLowerCase())) lastByExercise.set(r.exercise.toLowerCase(), r);
  const history = [...lastByExercise.values()].map(({ exercise, reps, weight_kg }) => ({ exercise, reps, weight_kg }));
  const workout = gymSession
    ? { sessionId: gymSession.id, sets: (sets ?? []) as WorkoutSet[], finishedMinutes: gymSession.ended_at ? sessionMinutes(gymSession) : null }
    : null;

  const { alerts } = await loadSmartAlerts(supabase, user.id, now);
  return (
    <div className="space-y-4">
      <SmartAlerts alerts={alerts} />
      <TimerBoard
        workout={workout}
        history={history}
        types={(types.data ?? []) as ActivityType[]}
        open={(open.data ?? []) as TimeSession[]}
        today={(today.data ?? []) as TimeSession[]}
        next={(next.data ?? []) as CalendarEvent[]}
        serverNow={now.getTime()}
        holdedReady={Boolean((holded.data?.config as { employeeId?: string } | undefined)?.employeeId)}
      />
    </div>
  );
}
