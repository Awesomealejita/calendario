/** Subconjunto de microsoft.graph.event que usamos (pedido con Prefer: outlook.timezone="UTC"). */
export interface GraphEvent {
  id: string;
  "@removed"?: { reason: string };
  subject?: string;
  bodyPreview?: string;
  start?: { dateTime: string; timeZone: string };
  end?: { dateTime: string; timeZone: string };
  isAllDay?: boolean;
  isCancelled?: boolean;
  showAs?: string;
  location?: { displayName?: string };
  onlineMeeting?: { joinUrl?: string } | null;
  webLink?: string;
  changeKey?: string;
  responseStatus?: { response?: string };
}

export interface GraphTodoTask {
  id: string;
  title: string;
  status: "notStarted" | "inProgress" | "completed" | "waitingOnOthers" | "deferred";
  dueDateTime?: { dateTime: string; timeZone: string } | null;
}

/** Graph devuelve "2026-10-12T08:00:00.0000000" sin zona cuando timeZone=UTC. */
export function graphDateToIso(d: { dateTime: string; timeZone: string }): string {
  const tz = d.timeZone?.toUpperCase();
  const hasOffset = /[zZ]|[+-]\d{2}:?\d{2}$/.test(d.dateTime);
  const raw = hasOffset || tz !== "UTC" ? d.dateTime : `${d.dateTime.replace(/\.\d+$/, "")}Z`;
  return new Date(raw).toISOString();
}

export function graphEventToRow(ev: GraphEvent, userId: string, workTypeId: string | null) {
  if (!ev.start || !ev.end) return null;
  const declined = ev.responseStatus?.response === "declined";
  return {
    user_id: userId,
    activity_type_id: workTypeId,
    title: ev.subject?.trim() || "(sin asunto)",
    notes: ev.bodyPreview || null,
    location: ev.location?.displayName || null,
    starts_at: graphDateToIso(ev.start),
    ends_at: graphDateToIso(ev.end),
    all_day: Boolean(ev.isAllDay),
    source: "outlook" as const,
    external_id: ev.id,
    etag: ev.changeKey ?? null,
    status: ev.isCancelled || declined ? ("cancelled" as const) : ("planned" as const),
    metadata: {
      webLink: ev.webLink ?? null,
      joinUrl: ev.onlineMeeting?.joinUrl ?? null,
      showAs: ev.showAs ?? null,
    },
  };
}

export function graphTaskToRow(t: GraphTodoTask, userId: string, listId: string, tasksTypeId: string | null) {
  return {
    user_id: userId,
    activity_type_id: tasksTypeId,
    title: t.title,
    due_at: t.dueDateTime ? graphDateToIso(t.dueDateTime) : null,
    done: t.status === "completed",
    source: "outlook" as const,
    external_id: t.id,
    external_list_id: listId,
  };
}

/** Evento local -> cuerpo para POST/PATCH /me/events. */
export function rowToGraphEvent(e: { title: string; notes: string | null; location: string | null; starts_at: string; ends_at: string; all_day: boolean }) {
  return {
    subject: e.title,
    body: e.notes ? { contentType: "text", content: e.notes } : undefined,
    location: e.location ? { displayName: e.location } : undefined,
    start: { dateTime: e.starts_at.replace(/Z$/, ""), timeZone: "UTC" },
    end: { dateTime: e.ends_at.replace(/Z$/, ""), timeZone: "UTC" },
    isAllDay: e.all_day,
  };
}
