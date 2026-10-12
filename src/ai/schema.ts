import { z } from "zod";

/** Acción que la app puede aplicar automáticamente al aceptar una sugerencia. */
export const SuggestionActionSchema = z.object({
  type: z
    .enum(["none", "move_event", "create_event", "mark_event_status"])
    .describe("none = solo consejo; move_event = mover un evento; create_event = crear un bloque; mark_event_status = cambiar estado"),
  eventId: z.string().nullable().describe("id del evento afectado (move_event, mark_event_status)"),
  activityTypeId: z.string().nullable().describe("tipo de actividad del evento a crear (create_event)"),
  title: z.string().nullable(),
  start: z.string().nullable().describe("ISO 8601 con zona, debe caer dentro de un hueco libre"),
  end: z.string().nullable().describe("ISO 8601 con zona"),
  status: z.enum(["done", "missed", "cancelled"]).nullable(),
});

export const SuggestionSchema = z.object({
  kind: z.enum(["gym", "work", "schedule", "tasks", "wellbeing"]),
  title: z.string().describe("Titular corto en español, máx. 60 caracteres"),
  body: z.string().describe("Explicación breve y concreta en español (1-3 frases), tono cercano"),
  action: SuggestionActionSchema,
});

export const SuggestionsResponseSchema = z.object({
  suggestions: z.array(SuggestionSchema).describe("Entre 0 y 5 sugerencias, de más a menos importante"),
});

export type SuggestionAction = z.infer<typeof SuggestionActionSchema>;
export type SuggestionDraft = z.infer<typeof SuggestionSchema>;

/** Valida que una acción propuesta por la IA sea aplicable sin pisar nada. */
export function validateAction(
  a: SuggestionAction,
  ctx: { eventIds: Set<string>; typeIds: Set<string>; slots: { start: string; end: string }[] },
): SuggestionAction {
  const none: SuggestionAction = { type: "none", eventId: null, activityTypeId: null, title: null, start: null, end: null, status: null };
  const inSlot = (s: string | null, e: string | null) => {
    if (!s || !e) return false;
    const st = Date.parse(s);
    const en = Date.parse(e);
    if (!(en > st)) return false;
    return ctx.slots.some((sl) => st >= Date.parse(sl.start) && en <= Date.parse(sl.end));
  };
  switch (a.type) {
    case "move_event":
      return a.eventId && ctx.eventIds.has(a.eventId) && inSlot(a.start, a.end) ? a : none;
    case "create_event":
      return a.activityTypeId && ctx.typeIds.has(a.activityTypeId) && a.title && inSlot(a.start, a.end) ? a : none;
    case "mark_event_status":
      return a.eventId && ctx.eventIds.has(a.eventId) && a.status ? a : none;
    default:
      return none;
  }
}
