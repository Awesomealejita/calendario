import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Cliente con service role: SOLO para crons y secretos de integraciones. Nunca exponer al cliente. */
export function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
