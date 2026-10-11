import { CalendarView } from "@/components/CalendarView";
import { TaskList } from "@/components/TaskList";
import { requireUser } from "@/lib/supabase/server";
import type { ActivityType, Task } from "@/lib/types";

export default async function CalendarPage() {
  const { supabase } = await requireUser();
  const [{ data: types }, { data: tasks }, { data: outlook }] = await Promise.all([
    supabase.from("activity_types").select("*").order("created_at"),
    supabase.from("tasks").select("*").eq("done", false).order("due_at", { ascending: true, nullsFirst: false }).limit(50),
    supabase.from("integrations").select("id").eq("provider", "outlook").maybeSingle(),
  ]);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <CalendarView types={(types ?? []) as ActivityType[]} outlookConnected={Boolean(outlook)} />
      <aside>
        <TaskList tasks={(tasks ?? []) as Task[]} />
      </aside>
    </div>
  );
}
