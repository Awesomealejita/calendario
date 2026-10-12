"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { runInsights } from "@/ai/suggest";
import { applyAction } from "@/ai/apply";
import { SuggestionActionSchema } from "@/ai/schema";

export async function refreshInsights() {
  const { supabase, user } = await requireUser();
  try {
    const r = await runInsights(supabase, user.id);
    revalidatePath("/insights");
    return { ok: true as const, count: r.count };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function acceptSuggestion(id: string) {
  const { supabase, user } = await requireUser();
  const { data: s } = await supabase.from("suggestions").select("*").eq("id", id).eq("status", "open").single();
  if (!s) return { ok: false as const, error: "Sugerencia no encontrada" };
  try {
    const action = s.action ? SuggestionActionSchema.parse(s.action) : null;
    await applyAction(supabase, user.id, action);
    await supabase.from("suggestions").update({ status: "accepted" }).eq("id", id);
    revalidatePath("/insights");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function dismissSuggestion(id: string) {
  const { supabase } = await requireUser();
  await supabase.from("suggestions").update({ status: "dismissed" }).eq("id", id);
  revalidatePath("/insights");
  return { ok: true as const };
}
