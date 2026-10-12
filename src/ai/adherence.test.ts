import { describe, expect, it } from "vitest";
import { analyzeAdherence, findFreeSlots } from "./adherence";
import type { ActivityType, CalendarEvent, TimeSession } from "@/lib/types";

const gym: ActivityType = {
  id: "g", user_id: "u", module: "gym", name: "Gym", color: "#FF8C6B", icon: "", has_timer: true,
  weekly_goal_minutes: 240, weekly_goal_sessions: 4,
};
const ev = (p: Partial<CalendarEvent>): CalendarEvent => ({
  id: "e1", user_id: "u", activity_type_id: "g", title: "Pierna", notes: null, location: null,
  starts_at: "2026-10-12T17:00:00Z", ends_at: "2026-10-12T18:00:00Z", all_day: false, rrule: null,
  source: "local", external_id: null, etag: null, status: "planned", metadata: {}, ...p,
});
const ses = (p: Partial<TimeSession>): TimeSession => ({
  id: "s1", user_id: "u", activity_type_id: "g", event_id: "e1", source: "timer", external_id: null,
  started_at: "2026-10-12T17:30:00Z", ended_at: "2026-10-12T17:50:00Z", pauses: [], notes: null, ...p,
});

describe("analyzeAdherence", () => {
  it("marca gym no acudido", () => {
    const r = analyzeAdherence({ types: [gym], events: [ev({})], sessions: [], tasks: [], now: new Date("2026-10-12T19:00:00Z") });
    expect(r.missedEventIds).toEqual(["e1"]);
    expect(r.issues.find((i) => i.kind === "missed")?.severity).toBe("high");
  });

  it("detecta inicio tarde y sesión corta", () => {
    const r = analyzeAdherence({ types: [gym], events: [ev({})], sessions: [ses({})], tasks: [], now: new Date("2026-10-12T19:00:00Z") });
    const kinds = r.issues.map((i) => i.kind);
    expect(kinds).toContain("late_start");
    expect(kinds).toContain("short_session");
    expect(r.missedEventIds).toEqual([]);
  });

  it("avisa del objetivo semanal cuando no da tiempo", () => {
    // Sábado 17/10: quedan 2 días y faltan 4 sesiones.
    const r = analyzeAdherence({ types: [gym], events: [], sessions: [], tasks: [], now: new Date("2026-10-17T10:00:00Z") });
    const w = r.issues.find((i) => i.kind === "weekly_goal_behind");
    expect(w?.severity).toBe("high");
  });
});

describe("findFreeSlots", () => {
  it("devuelve huecos entre eventos", () => {
    const now = new Date("2026-10-12T06:00:00Z"); // 08:00 Madrid
    const slots = findFreeSlots(
      [{ starts_at: "2026-10-12T07:00:00Z", ends_at: "2026-10-12T16:00:00Z", all_day: false, status: "planned" }],
      now,
      { days: 1, tz: "Europe/Madrid" },
    );
    expect(slots).toEqual([
      { start: "2026-10-12T06:00:00.000Z", end: "2026-10-12T07:00:00.000Z", minutes: 60 },
      { start: "2026-10-12T16:00:00.000Z", end: "2026-10-12T20:00:00.000Z", minutes: 240 },
    ]);
  });
});
