import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { addDays } from "date-fns";
import { analyzeAdherence, type AdherenceReport, type Issue } from "@/ai/adherence";
import { AI_MODEL, SYSTEM_PROMPT, aiEnabled, anthropic } from "@/ai/client";
import { SuggestionsResponseSchema, validateAction, type SuggestionDraft } from "@/ai/schema";
import { loadUserData, type UserData } from "@/lib/data";
import { moduleFor } from "@/modules/core/registry";
import { TIMEZONE } from "@/lib/time";

/** Resumen compacto (y sin notas/ubicaciones) que se envía al modelo. */
export function buildPromptContext(data: UserData, report: AdherenceReport) {
  const typeById = new Map(data.types.map((t) => [t.id, t]));
  return {
    now: report.generatedAt,
    timezone: TIMEZONE,
    activityTypes: data.types.map((t) => ({
      id: t.id,
      name: t.name,
      module: t.module,
      flexible: moduleFor(t).flexible,
      hint: moduleFor(t).aiHint,
      weeklyGoalSessions: t.weekly_goal_sessions,
      weeklyGoalMinutes: t.weekly_goal_minutes,
    })),
    events: data.events.map((e) => ({
      id: e.id,
      title: e.title,
      type: e.activity_type_id ? typeById.get(e.activity_type_id)?.module : null,
      start: e.starts_at,
      end: e.ends_at,
      status: e.status,
      source: e.source,
    })),
    issues: report.issues,
    weekly: report.weekly,
    workBalance: report.workBalance.filter((d) => d.flags.length),
    freeSlots: report.freeSlots,
  };
}

/** Sugerencias sin IA (si no hay ANTHROPIC_API_KEY o falla la llamada). */
export function fallbackSuggestions(issues: Issue[], report: AdherenceReport): SuggestionDraft[] {
  const none = { type: "none" as const, eventId: null, activityTypeId: null, title: null, start: null, end: null, status: null };
  const order = { high: 0, medium: 1, low: 2 };
  return [...issues]
    .sort((a, b) => order[a.severity] - order[b.severity])
    .slice(0, 5)
    .map((i): SuggestionDraft => {
      if ((i.kind === "missed" || i.kind === "weekly_goal_behind") && i.activityTypeId) {
        const slot = report.freeSlots.find((s) => s.minutes >= 60);
        if (slot) {
          const end = new Date(Date.parse(slot.start) + 60 * 60000).toISOString();
          return {
            kind: "gym",
            title: "Recupera la sesión",
            body: `${i.message} Tienes un hueco libre que empieza ${new Date(slot.start).toLocaleString("es-ES", { timeZone: TIMEZONE, weekday: "long", hour: "2-digit", minute: "2-digit" })}.`,
            action: { ...none, type: "create_event", activityTypeId: i.activityTypeId, title: "Gym (recuperación)", start: slot.start, end },
          };
        }
      }
      return {
        kind: i.kind === "work_balance" ? "work" : i.kind === "overdue_task" ? "tasks" : "schedule",
        title: i.kind === "work_balance" ? "Revisa tus fichajes" : "Atención",
        body: i.message,
        action: none,
      };
    });
}

async function askClaude(context: ReturnType<typeof buildPromptContext>): Promise<SuggestionDraft[]> {
  const response = await anthropic().beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(SuggestionsResponseSchema) },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Informe de cumplimiento (JSON):\n${JSON.stringify(context)}\n\nPropón las sugerencias.`,
      },
    ],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) return [];
  return response.parsed_output.suggestions.slice(0, 5);
}

/**
 * Analiza la última semana + próximos días, marca eventos no acudidos y regenera sugerencias abiertas.
 * `db` puede ser el cliente del usuario (RLS) o el admin (cron).
 */
export async function runInsights(db: SupabaseClient, userId: string, now = new Date()) {
  const data = await loadUserData(db, userId, addDays(now, -7), addDays(now, 3));
  const report = analyzeAdherence({ ...data, now });

  if (report.missedEventIds.length) {
    await db.from("events").update({ status: "missed" }).in("id", report.missedEventIds).eq("user_id", userId);
  }

  let drafts: SuggestionDraft[] = [];
  if (report.issues.length) {
    drafts = fallbackSuggestions(report.issues, report);
    if (aiEnabled()) {
      try {
        drafts = await askClaude(buildPromptContext(data, report));
      } catch (err) {
        if (!(err instanceof Anthropic.APIError)) throw err;
        console.error("IA no disponible, uso sugerencias básicas:", err.status, err.message);
      }
    }
  }

  const ctx = {
    eventIds: new Set(data.events.map((e) => e.id)),
    typeIds: new Set(data.types.map((t) => t.id)),
    slots: report.freeSlots,
  };
  await db.from("suggestions").delete().eq("user_id", userId).eq("status", "open");
  if (drafts.length) {
    const { error } = await db.from("suggestions").insert(
      drafts.map((d) => ({ user_id: userId, kind: d.kind, title: d.title, body: d.body, action: validateAction(d.action, ctx) })),
    );
    if (error) throw error;
  }
  return { report, count: drafts.length };
}
