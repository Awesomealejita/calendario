import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Entrada desde el enlace del email. Acepta dos formatos:
 * - `token_hash` + `type`: funciona aunque abras el enlace en otro dispositivo o navegador
 *   (p. ej. lo pides en el Mac y lo abres en el iPhone). Requiere la plantilla de email del README.
 * - `code` (PKCE): solo funciona en el mismo navegador que pidió el enlace.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const supabase = await supabaseServer();
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const code = url.searchParams.get("code");

  let ok = false;
  if (tokenHash && type) ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  else if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;

  return NextResponse.redirect(new URL(ok ? "/calendar" : "/login?error=link", url.origin));
}
