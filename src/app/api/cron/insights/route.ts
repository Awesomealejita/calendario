import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isCronAuthorized } from "@/lib/cron";
import { runInsights } from "@/ai/suggest";
import { sendPush } from "@/lib/push";

export const maxDuration = 300;

/** Análisis diario: marca no acudidos, genera sugerencias y avisa por push si hay algo importante. */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = supabaseAdmin();
  const { data: types, error } = await db.from("activity_types").select("user_id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const users = [...new Set((types ?? []).map((t) => t.user_id as string))];

  let notified = 0;
  for (const userId of users) {
    try {
      const { report, count } = await runInsights(db, userId);
      const important = report.issues.filter((i) => i.severity === "high");
      if (count && important.length) {
        notified += await sendPush(db, userId, {
          title: "Tu asistente tiene sugerencias",
          body: important[0].message + (important.length > 1 ? ` (+${important.length - 1} más)` : ""),
          url: "/insights",
        });
      }
    } catch (e) {
      console.error("insights", userId, (e as Error).message);
    }
  }
  return NextResponse.json({ users: users.length, notified });
}
