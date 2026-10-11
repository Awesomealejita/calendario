import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode } from "@/integrations/outlook/oauth";
import { syncOutlook } from "@/integrations/outlook/sync";
import { saveSecret } from "@/lib/secrets";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`/settings?outlook=${q}`, url.origin));
    res.cookies.delete("ms_oauth_state");
    return res;
  };

  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.redirect(new URL("/login", url.origin));

  const err = url.searchParams.get("error");
  // consent_required / admin approval → la empresa bloquea apps: proponemos ICS.
  if (err) return back(err.includes("consent") || err === "access_denied" ? "needs_admin" : "error");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || state !== req.cookies.get("ms_oauth_state")?.value) return back("bad_state");

  try {
    const tokens = await exchangeCode(code);
    await saveSecret(data.user.id, "outlook", tokens);
    await supabase.from("integrations").upsert({ user_id: data.user.id, provider: "outlook", config: {} }, { onConflict: "user_id,provider" });
    await syncOutlook(supabase, data.user.id).catch(() => undefined);
    return back("connected");
  } catch (e) {
    const msg = (e as Error).message;
    return back(/AADSTS(65001|90094|90095)/.test(msg) ? "needs_admin" : "error");
  }
}
