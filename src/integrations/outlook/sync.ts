import "server-only";
import { addDays } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GraphClient, GraphError } from "@/integrations/outlook/graph";
import { graphEventToRow, graphTaskToRow, rowToGraphEvent, type GraphEvent, type GraphTodoTask } from "@/integrations/outlook/mapping";
import { fetchIcs } from "@/integrations/outlook/ics";
import type { CalendarEvent } from "@/lib/types";

const PAST_DAYS = 14;
const FUTURE_DAYS = 60;

async function typeId(db: SupabaseClient, userId: string, module: string) {
  const { data } = await db.from("activity_types").select("id").eq("user_id", userId).eq("module", module).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function setState(db: SupabaseClient, userId: string, provider: string, patch: Record<string, unknown>) {
  await db.from("integrations").upsert({ user_id: userId, provider, ...patch }, { onConflict: "user_id,provider" });
}

/** Sincroniza reuniones (delta) y tareas To Do de Outlook. `db` = admin (cron) o RLS del usuario. */
export async function syncOutlook(db: SupabaseClient, userId: string) {
  const graph = await GraphClient.forUser(userId);
  if (!graph) return { skipped: true };
  const { data: integ } = await db.from("integrations").select("config").eq("user_id", userId).eq("provider", "outlook").maybeSingle();
  const config = (integ?.config ?? {}) as { deltaLink?: string; windowEnd?: string };
  const workTypeId = await typeId(db, userId, "work");

  try {
    // La ventana de calendarView/delta es fija: cuando se acerca su fin, reiniciamos con una nueva.
    const now = new Date();
    const stale = !config.windowEnd || new Date(config.windowEnd) < addDays(now, 14);
    const start = addDays(now, -PAST_DAYS).toISOString();
    const end = addDays(now, FUTURE_DAYS).toISOString();
    const url = !stale && config.deltaLink
      ? config.deltaLink
      : `/me/calendarView/delta?startDateTime=${start}&endDateTime=${end}`;

    let result;
    try {
      result = await graph.collect<GraphEvent>(url);
    } catch (e) {
      // 410 = deltaLink caducado → sincronización completa.
      if (e instanceof GraphError && e.status === 410) result = await graph.collect<GraphEvent>(`/me/calendarView/delta?startDateTime=${start}&endDateTime=${end}`);
      else throw e;
    }

    const removed = result.items.filter((e) => e["@removed"]).map((e) => e.id);
    const rows = result.items.filter((e) => !e["@removed"]).map((e) => graphEventToRow(e, userId, workTypeId)).filter((r) => r !== null);
    if (removed.length) await db.from("events").delete().eq("user_id", userId).eq("source", "outlook").in("external_id", removed);
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await db.from("events").upsert(rows.slice(i, i + 200), { onConflict: "user_id,source,external_id" });
      if (error) throw error;
    }

    const tasks = await syncTodo(db, graph, userId);
    await setState(db, userId, "outlook", {
      config: { deltaLink: result.deltaLink, windowEnd: stale ? end : config.windowEnd },
      last_synced_at: new Date().toISOString(),
      last_error: null,
    });
    return { events: rows.length, removed: removed.length, tasks };
  } catch (e) {
    await setState(db, userId, "outlook", { config, last_error: String((e as Error).message).slice(0, 500) });
    throw e;
  }
}

async function syncTodo(db: SupabaseClient, graph: GraphClient, userId: string) {
  const tasksTypeId = await typeId(db, userId, "tasks");
  const { items: lists } = await graph.collect<{ id: string; displayName: string }>("/me/todo/lists");
  let n = 0;
  for (const list of lists) {
    const { items } = await graph.collect<GraphTodoTask>(`/me/todo/lists/${list.id}/tasks?$filter=status ne 'completed'`);
    const rows = items.map((t) => graphTaskToRow(t, userId, list.id, tasksTypeId));
    if (rows.length) {
      const { error } = await db.from("tasks").upsert(rows, { onConflict: "user_id,source,external_id" });
      if (error) throw error;
    }
    n += rows.length;
  }
  return n;
}

/** Crea en Outlook un evento local (p. ej. bloque de trabajo) y lo vincula. */
export async function pushEventToOutlook(db: SupabaseClient, userId: string, ev: CalendarEvent) {
  const graph = await GraphClient.forUser(userId);
  if (!graph) throw new Error("Outlook no está conectado");
  const created = await graph.request<{ id: string; changeKey: string }>("/me/events", {
    method: "POST",
    body: JSON.stringify(rowToGraphEvent(ev)),
  });
  await db.from("events").update({ source: "outlook", external_id: created.id, etag: created.changeKey }).eq("id", ev.id);
}

/** Propaga a Outlook cambios de horario/título de un evento que vino de Outlook. */
export async function updateOutlookEvent(userId: string, ev: CalendarEvent) {
  const graph = await GraphClient.forUser(userId);
  if (!graph || !ev.external_id) return;
  await graph.request(`/me/events/${ev.external_id}`, { method: "PATCH", body: JSON.stringify(rowToGraphEvent(ev)) });
}

/** Marca una tarea de To Do como completada. */
export async function completeTodoTask(userId: string, listId: string, taskId: string) {
  const graph = await GraphClient.forUser(userId);
  if (!graph) return;
  await graph.request(`/me/todo/lists/${listId}/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ status: "completed" }) });
}

/** Fallback sin permisos de Graph: importa la URL ICS publicada (solo lectura). */
export async function syncIcs(db: SupabaseClient, userId: string) {
  const { data: integ } = await db.from("integrations").select("config").eq("user_id", userId).eq("provider", "ics").maybeSingle();
  const url = (integ?.config as { url?: string } | undefined)?.url;
  if (!url) return { skipped: true };
  try {
    const now = new Date();
    const from = addDays(now, -PAST_DAYS);
    const occ = await fetchIcs(url, from, addDays(now, FUTURE_DAYS));
    const workTypeId = await typeId(db, userId, "work");
    const rows = occ.map((o) => ({
      user_id: userId,
      activity_type_id: workTypeId,
      title: o.title,
      location: o.location,
      starts_at: o.start,
      ends_at: o.end,
      all_day: o.allDay,
      source: "ics" as const,
      external_id: o.uid,
      status: o.cancelled ? ("cancelled" as const) : ("planned" as const),
    }));
    // Lo que ya no está en el feed dentro de la ventana se borra.
    const keep = new Set(rows.map((r) => r.external_id));
    const { data: existing } = await db
      .from("events")
      .select("id, external_id")
      .eq("user_id", userId)
      .eq("source", "ics")
      .gte("starts_at", from.toISOString());
    const stale = (existing ?? []).filter((e) => !keep.has(e.external_id)).map((e) => e.id);
    if (stale.length) await db.from("events").delete().in("id", stale);
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await db.from("events").upsert(rows.slice(i, i + 200), { onConflict: "user_id,source,external_id" });
      if (error) throw error;
    }
    await setState(db, userId, "ics", { config: { url }, last_synced_at: new Date().toISOString(), last_error: null });
    return { events: rows.length, removed: stale.length };
  } catch (e) {
    await setState(db, userId, "ics", { config: { url }, last_error: String((e as Error).message).slice(0, 500) });
    throw e;
  }
}
