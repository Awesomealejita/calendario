import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SuggestionAction } from "@/ai/schema";

/** Aplica la acción de una sugerencia aceptada (siempre con el cliente RLS del usuario). */
export async function applyAction(db: SupabaseClient, userId: string, action: SuggestionAction | null) {
  if (!action || action.type === "none") return;
  if (action.type === "move_event" && action.eventId && action.start && action.end) {
    const { data: ev } = await db.from("events").select("source").eq("id", action.eventId).single();
    if (ev?.source !== "local") throw new Error("Solo se pueden mover eventos creados en la app");
    const { error } = await db
      .from("events")
      .update({ starts_at: action.start, ends_at: action.end, status: "planned" })
      .eq("id", action.eventId);
    if (error) throw error;
  } else if (action.type === "create_event" && action.activityTypeId && action.title && action.start && action.end) {
    const { error } = await db.from("events").insert({
      user_id: userId,
      activity_type_id: action.activityTypeId,
      title: action.title,
      starts_at: action.start,
      ends_at: action.end,
      metadata: { createdBy: "ai" },
    });
    if (error) throw error;
  } else if (action.type === "mark_event_status" && action.eventId && action.status) {
    const { error } = await db.from("events").update({ status: action.status }).eq("id", action.eventId);
    if (error) throw error;
  }
}
