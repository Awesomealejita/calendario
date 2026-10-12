import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "date-fns";
import { HoldedClient, type HoldedSecret } from "@/integrations/holded/client";
import { holdedTimeToSession } from "@/integrations/holded/mapping";
import { readSecret } from "@/lib/secrets";

export async function holdedFor(db: SupabaseClient, userId: string) {
  const secret = await readSecret<HoldedSecret>(userId, "holded");
  if (!secret) return null;
  const { data } = await db.from("integrations").select("config").eq("user_id", userId).eq("provider", "holded").maybeSingle();
  const employeeId = (data?.config as { employeeId?: string } | undefined)?.employeeId;
  if (!employeeId) return null;
  return { client: new HoldedClient(secret.apiKey), employeeId, config: data!.config as Record<string, unknown> };
}

/** Importa los fichajes de los últimos 35 días a time_sessions (origen holded). */
export async function syncHolded(db: SupabaseClient, userId: string) {
  const h = await holdedFor(db, userId);
  if (!h) return { skipped: true };
  try {
    const { data: work } = await db.from("activity_types").select("id").eq("user_id", userId).eq("module", "work").limit(1).maybeSingle();
    const since = addDays(new Date(), -35).getTime();
    const rows = (await h.client.times(h.employeeId))
      .map((t) => holdedTimeToSession(t, userId, work?.id ?? null))
      .filter((r): r is NonNullable<typeof r> => r !== null && new Date(r.started_at).getTime() >= since);
    if (rows.length) {
      const { error } = await db.from("time_sessions").upsert(rows, { onConflict: "user_id,source,external_id" });
      if (error) throw error;
    }
    await db.from("integrations").update({ last_synced_at: new Date().toISOString(), last_error: null }).eq("user_id", userId).eq("provider", "holded");
    return { sessions: rows.length };
  } catch (e) {
    await db.from("integrations").update({ last_error: String((e as Error).message).slice(0, 500) }).eq("user_id", userId).eq("provider", "holded");
    throw e;
  }
}
