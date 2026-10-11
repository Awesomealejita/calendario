import { addDays, startOfDay } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { TIMEZONE } from "@/lib/time";
import { TimerBoard } from "@/components/TimerBoard";
import { requireUser } from "@/lib/supabase/server";
import type { ActivityType, CalendarEvent, TimeSession } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TimerPage() {
  const { supabase } = await requireUser();
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
  return (
    <TimerBoard
      types={(types.data ?? []) as ActivityType[]}
      open={(open.data ?? []) as TimeSession[]}
      today={(today.data ?? []) as TimeSession[]}
      next={(next.data ?? []) as CalendarEvent[]}
      holdedReady={Boolean((holded.data?.config as { employeeId?: string } | undefined)?.employeeId)}
    />
  );
}
