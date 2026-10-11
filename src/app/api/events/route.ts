import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import type { ActivityType, CalendarEvent } from "@/lib/types";

/** Feed para FullCalendar: /api/events?start=ISO&end=ISO */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  if (!start || !end) return NextResponse.json({ error: "start y end son obligatorios" }, { status: 400 });

  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const [{ data: events, error }, { data: types }] = await Promise.all([
    supabase.from("events").select("*").lt("starts_at", end).gt("ends_at", start).order("starts_at"),
    supabase.from("activity_types").select("*"),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const typeById = new Map((types as ActivityType[]).map((t) => [t.id, t]));

  return NextResponse.json(
    (events as CalendarEvent[]).map((e) => {
      const t = e.activity_type_id ? typeById.get(e.activity_type_id) : undefined;
      const color = e.source === "local" ? (t?.color ?? "#7C3F82") : "#7C3F82";
      return {
        id: e.id,
        title: `${t?.icon ? `${t.icon} ` : ""}${e.title}`,
        start: e.starts_at,
        end: e.ends_at,
        allDay: e.all_day,
        backgroundColor: color,
        borderColor: e.source === "local" ? color : "#2C2153",
        textColor: isLight(color) ? "#2C2153" : "#FFFFFF",
        editable: e.source !== "ics",
        classNames: [`ev-${e.status}`, `src-${e.source}`],
        extendedProps: { raw: e, module: t?.module ?? null },
      };
    }),
  );
}

function isLight(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 160;
}
