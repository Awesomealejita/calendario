import { NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseServer } from "@/lib/supabase/server";
import { chat } from "@/ai/chat";
import { aiEnabled } from "@/ai/client";

export const maxDuration = 60;

const Body = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) })).min(1).max(30),
});

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!aiEnabled()) return NextResponse.json({ error: "Falta ANTHROPIC_API_KEY en el servidor" }, { status: 503 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Mensaje no válido" }, { status: 400 });
  try {
    const reply = await chat(supabase, data.user.id, parsed.data.messages);
    return NextResponse.json({ reply });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "Demasiadas peticiones, prueba en un momento" }, { status: 429 });
    if (e instanceof Anthropic.APIError) return NextResponse.json({ error: `IA no disponible (${e.status})` }, { status: 502 });
    throw e;
  }
}
