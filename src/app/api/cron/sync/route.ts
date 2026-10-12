import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isCronAuthorized } from "@/lib/cron";
import { syncIcs, syncOutlook } from "@/integrations/outlook/sync";
import { syncHolded } from "@/integrations/holded/sync";
import { loadSmartAlerts } from "@/lib/alerts-data";
import { sendPush } from "@/lib/push";

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
  // Avisos inteligentes por push (una sola vez por aviso).
  let alertsSent = 0;
  const { data: subs } = await db.from("push_subscriptions").select("user_id");
  for (const userId of new Set((subs ?? []).map((s) => s.user_id as string))) {
    try {
      const { alerts, events } = await loadSmartAlerts(db, userId);
      for (const a of alerts) {
        const ev = events.find((e) => e.id === a.eventId);
        if (!ev || ev.metadata?.alertNotified === a.id) continue;
        if (await sendPush(db, userId, { title: a.title, body: a.body, url: "/calendar" })) alertsSent++;
        await db.from("events").update({ metadata: { ...ev.metadata, alertNotified: a.id } }).eq("id", ev.id);
      }
    } catch (e) {
      console.error("alerts", userId, (e as Error).message);
    }
  }

  return NextResponse.json({
    ok: results.filter((r) => r.status === "fulfilled").length,
    failed: results.filter((r) => r.status === "rejected").length,
    alertsSent,
  });
}
