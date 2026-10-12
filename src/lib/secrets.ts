import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { decrypt, encrypt } from "@/lib/crypto";

export type Provider = "outlook" | "ics" | "holded";

export async function saveSecret(userId: string, provider: Provider, value: unknown) {
  const { error } = await supabaseAdmin()
    .from("integration_secrets")
    .upsert({ user_id: userId, provider, secret_enc: encrypt(JSON.stringify(value)), updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function readSecret<T>(userId: string, provider: Provider): Promise<T | null> {
  const { data, error } = await supabaseAdmin()
    .from("integration_secrets")
    .select("secret_enc")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  if (error) throw error;
  return data ? (JSON.parse(decrypt(data.secret_enc)) as T) : null;
}

export async function deleteSecret(userId: string, provider: Provider) {
  await supabaseAdmin().from("integration_secrets").delete().eq("user_id", userId).eq("provider", provider);
}
