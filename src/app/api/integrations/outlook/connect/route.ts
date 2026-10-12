import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { authorizeUrl } from "@/integrations/outlook/oauth";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.redirect(new URL("/login", req.url));
  if (!process.env.MS_CLIENT_ID) return NextResponse.redirect(new URL("/settings?outlook=missing_config", req.url));
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set("ms_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
