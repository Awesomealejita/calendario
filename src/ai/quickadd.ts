import "server-only";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import Anthropic from "@anthropic-ai/sdk";
import { AI_MODEL, aiEnabled, anthropic } from "@/ai/client";
import { parseQuickAdd, type QuickAddDraft } from "@/lib/quickadd";
import { TIMEZONE } from "@/lib/time";

const AiDraft = z.object({
  title: z.string().describe("Título corto en español, sin la fecha ni la hora"),
  module: z.enum(["gym", "work", "appointments", "tasks", "custom"]),
  start: z.string().describe("Inicio ISO 8601 con zona horaria"),
  end: z.string().describe("Fin ISO 8601 con zona horaria"),
  allDay: z.boolean(),
});

/**
 * Convierte una frase en un borrador de evento. Usa Claude si hay clave (entiende frases más libres)
 * y si no, o si falla, el intérprete local. Siempre devuelve un borrador revisable antes de guardar.
 */
export async function draftFromText(text: string, now = new Date()): Promise<QuickAddDraft | null> {
  const local = parseQuickAdd(text, now);
  if (!aiEnabled() || !local) return local;
  try {
    const res = await anthropic().beta.messages.parse({
      model: AI_MODEL,
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(AiDraft) },
      system:
        `Conviertes frases en español en eventos de calendario. Ahora es ${now.toISOString()} y la zona horaria es ${TIMEZONE}. ` +
        "Módulos: gym (deporte), work (reuniones/trabajo), appointments (citas: médico, dentista…), tasks (recados), custom. " +
        "Si no se dice hora, allDay=true. Duración por defecto: 60 min (tasks 30).",
      messages: [{ role: "user", content: text }],
    });
    const d = res.parsed_output;
    if (res.stop_reason === "refusal" || !d || !(Date.parse(d.end) > Date.parse(d.start))) return local;
    return { ...d, start: new Date(d.start).toISOString(), end: new Date(d.end).toISOString(), hasTime: !d.allDay };
  } catch (e) {
    if (e instanceof Anthropic.APIError) return local;
    throw e;
  }
}
