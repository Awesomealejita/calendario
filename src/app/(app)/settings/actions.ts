"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { deleteSecret, saveSecret, type Provider } from "@/lib/secrets";
import { HoldedClient } from "@/integrations/holded/client";
import { syncHolded } from "@/integrations/holded/sync";
import { syncIcs, syncOutlook } from "@/integrations/outlook/sync";

type Result = { ok: true; message?: string } | { ok: false; error: string };
const fail = (e: unknown): Result => ({ ok: false, error: (e as Error).message });

export async function saveIcsUrl(url: string): Promise<Result> {
  const { supabase, user } = await requireUser();
  const parsed = z.string().url().safeParse(url.trim().replace(/^webcal:/i, "https:"));
  if (!parsed.success) return { ok: false, error: "URL no válida" };
  await supabase.from("integrations").upsert({ user_id: user.id, provider: "ics", config: { url: parsed.data } }, { onConflict: "user_id,provider" });
  try {
    const r = await syncIcs(supabase, user.id);
    revalidatePath("/settings");
    return { ok: true, message: `Importados ${"events" in r ? r.events : 0} eventos` };
  } catch (e) {
    return fail(e);
  }
}

export async function saveHolded(apiKey: string, employeeId?: string): Promise<Result> {
  const { supabase, user } = await requireUser();
  const key = apiKey.trim();
  if (key.length < 10) return { ok: false, error: "API key no válida" };
  try {
    const client = new HoldedClient(key);
    const employees = await client.employees();
    const email = user.email?.toLowerCase();
    const me =
      employees.find((e) => e.id === employeeId) ??
      employees.find((e) => [e.email, e.mainEmail].some((m) => m?.toLowerCase() === email));
    if (!me) {
      return {
        ok: false,
        error: `No encuentro tu empleado en Holded con el email ${user.email}. Indica tu ID de empleado. Disponibles: ${employees
          .slice(0, 10)
          .map((e) => `${e.name ?? ""} ${e.lastName ?? ""} (${e.id})`)
          .join(", ")}`,
      };
    }
    await saveSecret(user.id, "holded", { apiKey: key });
    await supabase
      .from("integrations")
      .upsert({ user_id: user.id, provider: "holded", config: { employeeId: me.id, employeeName: `${me.name ?? ""} ${me.lastName ?? ""}`.trim() } }, { onConflict: "user_id,provider" });
    const r = await syncHolded(supabase, user.id).catch(() => ({ sessions: 0 }));
    revalidatePath("/settings");
    return { ok: true, message: `Conectado como ${me.name ?? me.id}. ${"sessions" in r ? r.sessions : 0} fichajes importados.` };
  } catch (e) {
    return fail(e);
  }
}

export async function disconnect(provider: Provider): Promise<Result> {
  const { supabase, user } = await requireUser();
  await deleteSecret(user.id, provider);
  await supabase.from("integrations").delete().eq("provider", provider);
  if (provider !== "holded") await supabase.from("events").delete().eq("source", provider);
  revalidatePath("/settings");
  return { ok: true };
}

export async function syncNow(): Promise<Result> {
  const { supabase, user } = await requireUser();
  const results = await Promise.allSettled([syncOutlook(supabase, user.id), syncIcs(supabase, user.id), syncHolded(supabase, user.id)]);
  revalidatePath("/settings");
  const errors = results.filter((r): r is PromiseRejectedResult => r.status === "rejected").map((r) => (r.reason as Error).message);
  return errors.length ? { ok: false, error: errors.join(" · ") } : { ok: true, message: "Sincronizado" };
}

const TypeInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon: z.string().max(8),
  has_timer: z.boolean(),
  weekly_goal_sessions: z.number().int().min(0).max(50).nullable(),
  weekly_goal_minutes: z.number().int().min(0).max(10080).nullable(),
});

export async function saveActivityType(input: z.input<typeof TypeInput>): Promise<Result> {
  const parsed = TypeInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos no válidos" };
  const { supabase, user } = await requireUser();
  const { id, ...fields } = parsed.data;
  const q = id
    ? supabase.from("activity_types").update(fields).eq("id", id)
    : supabase.from("activity_types").insert({ ...fields, user_id: user.id, module: "custom" });
  const { error } = await q;
  revalidatePath("/settings");
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deleteActivityType(id: string): Promise<Result> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("activity_types").delete().eq("id", id).eq("module", "custom");
  revalidatePath("/settings");
  return error ? { ok: false, error: error.message } : { ok: true };
}
