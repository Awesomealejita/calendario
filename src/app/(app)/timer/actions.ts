"use server";
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
