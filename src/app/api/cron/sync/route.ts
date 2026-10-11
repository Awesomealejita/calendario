import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isCronAuthorized } from "@/lib/cron";
import { syncIcs, syncOutlook } from "@/integrations/outlook/sync";
import { syncHolded } from "@/integrations/holded/sync";

export const maxDuration = 60;

/** Sincroniza Outlook / ICS / Holded de todos los usuarios con integraciones. */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = supabaseAdmin();
  const { data, error } = await db.from("integrations").select("user_id, provider");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const jobs = { outlook: syncOutlook, ics: syncIcs, holded: syncHolded } as const;
  const results = await Promise.allSettled(
    (data ?? []).map(async ({ user_id, provider }) => {
      const fn = jobs[provider as keyof typeof jobs];
      return fn ? { user_id, provider, result: await fn(db, user_id) } : null;
    }),
  );
  return NextResponse.json({
    ok: results.filter((r) => r.status === "fulfilled").length,
    failed: results.filter((r) => r.status === "rejected").length,
  });
}
