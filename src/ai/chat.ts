import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { addDays } from "date-fns";
import { AI_MODEL, SYSTEM_PROMPT, anthropic } from "@/ai/client";
import { analyzeAdherence, findFreeSlots } from "@/ai/adherence";
import { loadUserData } from "@/lib/data";
import { TIMEZONE } from "@/lib/time";

/** Chat con herramientas sobre el calendario del usuario (siempre con su cliente RLS). */
export async function chat(db: SupabaseClient, userId: string, history: Anthropic.Beta.BetaMessageParam[]) {
  const listEvents = betaZodTool({
    name: "list_events",
    description: "Lista los eventos del usuario entre dos fechas ISO (incluye reuniones de Outlook, gym, citas).",
    inputSchema: z.object({ from: z.string(), to: z.string() }),
    run: async ({ from, to }) => {
      const { data } = await db
        .from("events")
        .select("id, title, starts_at, ends_at, status, source, activity_type_id")
        .eq("user_id", userId)
        .lt("starts_at", to)
        .gt("ends_at", from)
        .order("starts_at")
        .limit(200);
      return JSON.stringify(data ?? []);
    },
  });

  const freeSlots = betaZodTool({
    name: "free_slots",
    description: "Huecos libres (sin eventos) de al menos N minutos en los próximos días, entre 7:00 y 22:00.",
    inputSchema: z.object({ days: z.number().int().min(1).max(14), minMinutes: z.number().int().min(15).max(240) }),
    run: async ({ days, minMinutes }) => {
      const now = new Date();
      const { data } = await db
        .from("events")
        .select("starts_at, ends_at, all_day, status")
        .eq("user_id", userId)
        .gte("ends_at", now.toISOString())
        .lte("starts_at", addDays(now, days).toISOString());
      return JSON.stringify(findFreeSlots(data ?? [], now, { days, minMinutes }));
    },
  });

  const status = betaZodTool({
    name: "adherence_report",
    description: "Informe de cumplimiento: eventos no acudidos, objetivos semanales (gym), cuadre de horas Holded vs Outlook.",
    inputSchema: z.object({}),
    run: async () => {
      const now = new Date();
      const data = await loadUserData(db, userId, addDays(now, -7), addDays(now, 3));
      const r = analyzeAdherence({ ...data, now });
      return JSON.stringify({ issues: r.issues, weekly: r.weekly, workBalance: r.workBalance, types: data.types.map((t) => ({ id: t.id, name: t.name, module: t.module })) });
    },
  });

  const createEvent = betaZodTool({
    name: "create_event",
    description: "Crea un evento en el calendario del usuario. Úsalo solo si el usuario lo pide o lo confirma explícitamente.",
    inputSchema: z.object({
      title: z.string().min(1).max(200),
      activityTypeId: z.string().describe("id de adherence_report.types"),
      start: z.string().describe("ISO 8601"),
      end: z.string().describe("ISO 8601"),
    }),
    run: async ({ title, activityTypeId, start, end }) => {
      if (!(Date.parse(end) > Date.parse(start))) return "Error: el fin debe ser posterior al inicio";
      const { error } = await db.from("events").insert({
        user_id: userId,
        title,
        activity_type_id: activityTypeId,
        starts_at: new Date(start).toISOString(),
        ends_at: new Date(end).toISOString(),
        metadata: { createdBy: "ai" },
      });
      return error ? `Error: ${error.message}` : "Evento creado";
    },
  });

  const final = await anthropic().beta.messages.toolRunner({
    model: AI_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: `${SYSTEM_PROMPT}\nAhora estás en modo chat. Fecha y hora actual: ${new Date().toISOString()} (zona ${TIMEZONE}). Responde breve.`,
    tools: [listEvents, freeSlots, status, createEvent],
    messages: history,
    max_iterations: 8,
  });

  if (final.stop_reason === "refusal") return "No puedo ayudarte con eso.";
  return final.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
