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
        title: e.title,
        start: e.starts_at,
        end: e.ends_at,
        allDay: e.all_day,
        backgroundColor: color,
        borderColor: e.source === "local" ? color : "#2C2153",
        textColor: bestText(color),
        editable: e.source !== "ics",
        classNames: [`ev-${e.status}`, `src-${e.source}`],
        extendedProps: { raw: e, module: t?.module ?? null },
      };
    }),
  );
}

const luminance = (hex: string) => {
  const n = parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
/** Texto blanco o morado noche, el que más contraste dé sobre el color del evento. */
function bestText(bg: string) {
  return contrast(bg, "#FFFFFF") >= contrast(bg, "#2C2153") ? "#FFFFFF" : "#2C2153";
}
