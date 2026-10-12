"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { startTimer, stopTimer, togglePause } from "@/modules/core/timer";

type Result = { ok: true; warning?: string | null } | { ok: false; error: string };

async function wrap(fn: () => Promise<string | null | void>): Promise<Result> {
  try {
    const warning = await fn();
    revalidatePath("/timer");
    return { ok: true, warning: warning ?? null };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function startAction(activityTypeId: string, holded: boolean) {
  const { supabase, user } = await requireUser();
  return wrap(async () => (await startTimer(supabase, user.id, activityTypeId, { holded })).warning);
}

export async function pauseAction(sessionId: string, holded: boolean) {
  const { supabase, user } = await requireUser();
  return wrap(() => togglePause(supabase, user.id, sessionId, { holded }));
}

export async function stopAction(sessionId: string, holded: boolean, notes?: string) {
  const { supabase, user } = await requireUser();
  return wrap(() => stopTimer(supabase, user.id, sessionId, { holded, notes }));
}

const SetInput = z.object({
  sessionId: z.string().uuid(),
  exercise: z.string().trim().min(1).max(80),
  reps: z.number().int().min(0).max(1000).nullable(),
  weightKg: z.number().min(0).max(1000).nullable(),
});

export async function addSet(input: z.input<typeof SetInput>): Promise<Result> {
  const parsed = SetInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revisa ejercicio, repeticiones y peso" };
  const { supabase, user } = await requireUser();
  const { sessionId, exercise, reps, weightKg } = parsed.data;
  const { error } = await supabase
    .from("workout_sets")
    .insert({ user_id: user.id, session_id: sessionId, exercise, reps, weight_kg: weightKg });
  revalidatePath("/timer");
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deleteSet(id: string): Promise<Result> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("workout_sets").delete().eq("id", id);
  revalidatePath("/timer");
  return error ? { ok: false, error: error.message } : { ok: true };
}
