"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { completeTodoTask, pushEventToOutlook, updateOutlookEvent } from "@/integrations/outlook/sync";
import type { ActivityType, CalendarEvent, Task } from "@/lib/types";
import { draftFromText } from "@/ai/quickadd";

const EventInput = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200),
  activity_type_id: z.string().uuid().nullable(),
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }),
  all_day: z.boolean().default(false),
  notes: z.string().max(5000).nullable().default(null),
  location: z.string().max(300).nullable().default(null),
  rrule: z.string().max(500).nullable().default(null),
  pushToOutlook: z.boolean().default(false),
});

export type ActionResult = { ok: true; warning?: string } | { ok: false; error: string };

export async function saveEvent(input: z.input<typeof EventInput>): Promise<ActionResult> {
  const parsed = EventInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos del evento no válidos" };
  const { id, pushToOutlook, ...fields } = parsed.data;
  if (new Date(fields.ends_at) < new Date(fields.starts_at)) return { ok: false, error: "El fin es anterior al inicio" };
  const { supabase, user } = await requireUser();

  let ev: CalendarEvent;
  if (id) {
    const { data: prev } = await supabase.from("events").select("source").eq("id", id).single();
    if (prev?.source === "ics") return { ok: false, error: "Los eventos ICS son de solo lectura" };
    const { data, error } = await supabase.from("events").update(fields).eq("id", id).select().single<CalendarEvent>();
    if (error) return { ok: false, error: error.message };
    ev = data;
  } else {
    const { data, error } = await supabase.from("events").insert({ ...fields, user_id: user.id }).select().single<CalendarEvent>();
    if (error) return { ok: false, error: error.message };
    ev = data;
  }

  let warning: string | undefined;
  try {
    if (ev.source === "outlook") await updateOutlookEvent(user.id, ev);
    else if (pushToOutlook) await pushEventToOutlook(supabase, user.id, ev);
  } catch (e) {
    warning = `Guardado en la app, pero no en Outlook: ${(e as Error).message}`;
  }
  revalidatePath("/calendar");
  return { ok: true, warning };
}

export async function moveEvent(id: string, starts_at: string, ends_at: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("events")
    .update({ starts_at, ends_at, status: "planned" })
    .eq("id", id)
    .neq("source", "ics")
    .select()
    .single<CalendarEvent>();
  if (error) return { ok: false, error: error.message };
  if (data.source === "outlook") {
    try {
      await updateOutlookEvent(user.id, data);
    } catch (e) {
      return { ok: true, warning: `Movido en la app, no en Outlook: ${(e as Error).message}` };
    }
  }
  return { ok: true };
}

export async function setEventStatus(id: string, status: CalendarEvent["status"]): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("events").update({ status }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deleteEvent(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("events").delete().eq("id", id).eq("source", "local");
  revalidatePath("/calendar");
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function addTask(title: string, due_at: string | null): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const clean = title.trim().slice(0, 200);
  if (!clean) return { ok: false, error: "Escribe la tarea" };
  const { data: type } = await supabase.from("activity_types").select("id").eq("module", "tasks").limit(1).maybeSingle();
  const { error } = await supabase.from("tasks").insert({ user_id: user.id, title: clean, due_at, activity_type_id: type?.id ?? null });
  revalidatePath("/calendar");
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function toggleTask(id: string, done: boolean): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase.from("tasks").update({ done }).eq("id", id).select().single<Task>();
  if (error) return { ok: false, error: error.message };
  if (done && data.source === "outlook" && data.external_id && data.external_list_id) {
    try {
      await completeTodoTask(user.id, data.external_list_id, data.external_id);
    } catch (e) {
      return { ok: true, warning: `Hecha en la app, no en To Do: ${(e as Error).message}` };
    }
  }
  revalidatePath("/calendar");
  return { ok: true };
}

/** Interpreta una frase ("gym mañana a las 7") y devuelve un borrador para confirmar. */
export async function previewQuickAdd(text: string) {
  const { supabase } = await requireUser();
  const clean = text.trim().slice(0, 300);
  if (!clean) return { ok: false as const, error: "Escribe o dicta algo" };
  const draft = await draftFromText(clean);
  if (!draft) return { ok: false as const, error: "No he entendido la frase" };
  const { data: types } = await supabase.from("activity_types").select("*");
  const list = (types ?? []) as ActivityType[];
  const type = list.find((t) => t.module === draft.module) ?? list.find((t) => t.module === "appointments") ?? list[0];
  return { ok: true as const, draft: { ...draft, activity_type_id: type?.id ?? null } };
}

/** "Mantener": no volver a avisar de este evento. */
export async function dismissAlert(eventId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("events").select("metadata").eq("id", eventId).single();
  const { error } = await supabase
    .from("events")
    .update({ metadata: { ...((data?.metadata as Record<string, unknown>) ?? {}), alertDismissed: true } })
    .eq("id", eventId);
  revalidatePath("/calendar");
  revalidatePath("/timer");
  return error ? { ok: false, error: error.message } : { ok: true };
}
