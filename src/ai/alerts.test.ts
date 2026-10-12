import { describe, expect, it } from "vitest";
import { computeSmartAlerts } from "./alerts";
import type { ActivityType, CalendarEvent } from "@/lib/types";

const types: ActivityType[] = [
  { id: "g", user_id: "u", module: "gym", name: "Gym", color: "", icon: "", has_timer: true, weekly_goal_minutes: null, weekly_goal_sessions: 4 },
  { id: "w", user_id: "u", module: "work", name: "Trabajo", color: "", icon: "", has_timer: true, weekly_goal_minutes: null, weekly_goal_sessions: null },
];
let n = 0;
const ev = (p: Partial<CalendarEvent>): CalendarEvent => ({
  id: `e${++n}`, user_id: "u", activity_type_id: "g", title: "Gym", notes: null, location: null, starts_at: "", ends_at: "",
  all_day: false, rrule: null, source: "local", external_id: null, etag: null, status: "planned", metadata: {}, ...p,
});
// Lunes 12/10/2026 09:00 Madrid.
const now = new Date("2026-10-12T07:00:00Z");
const run = (events: CalendarEvent[]) => computeSmartAlerts({ events, types, now, tz: "Europe/Madrid" });

describe("avisos inteligentes", () => {
  it("gym justo después de la última reunión", () => {
    const gym = ev({ starts_at: "2026-10-12T17:00:00Z", ends_at: "2026-10-12T18:00:00Z" }); // 19:00
    const meeting = ev({ title: "Comité", source: "outlook", activity_type_id: "w", starts_at: "2026-10-12T15:00:00Z", ends_at: "2026-10-12T16:10:00Z" }); // hasta 18:10
    const [a] = run([gym, meeting]);
    expect(a.kind).toBe("tight");
    expect(a.body).toBe("Sales de «Comité» a las 18:10, ¿mantienes el gym a las 19:00?");
    expect(a.suggestion?.start).toBe("2026-10-12T17:15:00.000Z"); // 19:15
  });

  it("reunión que pisa el gym propone mover", () => {
    const gym = ev({ starts_at: "2026-10-12T17:00:00Z", ends_at: "2026-10-12T18:00:00Z" });
    const meeting = ev({ title: "Cliente", source: "outlook", activity_type_id: "w", starts_at: "2026-10-12T16:30:00Z", ends_at: "2026-10-12T17:30:00Z" });
    const [a] = run([gym, meeting]);
    expect(a.kind).toBe("conflict");
    expect(a.suggestion?.start).toBe("2026-10-12T18:30:00.000Z"); // 20:30
  });

  it("sin aviso si hay margen suficiente, si ya pasó o si se descartó", () => {
    const meeting = ev({ source: "outlook", activity_type_id: "w", starts_at: "2026-10-12T13:00:00Z", ends_at: "2026-10-12T14:00:00Z" });
    expect(run([ev({ starts_at: "2026-10-12T17:00:00Z", ends_at: "2026-10-12T18:00:00Z" }), meeting])).toEqual([]);
    expect(run([ev({ starts_at: "2026-10-12T06:00:00Z", ends_at: "2026-10-12T07:00:00Z" })])).toEqual([]);
    const dismissed = ev({ starts_at: "2026-10-12T14:30:00Z", ends_at: "2026-10-12T15:30:00Z", metadata: { alertDismissed: true } });
    expect(run([dismissed, meeting])).toEqual([]);
  });

  it("sin hueco antes del cierre no propone hora", () => {
    const gym = ev({ starts_at: "2026-10-12T19:00:00Z", ends_at: "2026-10-12T20:00:00Z" }); // 21:00
    const meeting = ev({ source: "outlook", activity_type_id: "w", starts_at: "2026-10-12T18:30:00Z", ends_at: "2026-10-12T19:30:00Z" });
    const [a] = run([gym, meeting]);
    expect(a.suggestion).toBeNull();
    expect(a.body).toContain("muévelo a otro día");
  });
});
