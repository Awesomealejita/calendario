import { describe, expect, it } from "vitest";
import { reconcileWork } from "./reconcile";
import type { ActivityType, CalendarEvent, TimeSession } from "./types";

const work: ActivityType = {
  id: "w", user_id: "u", module: "work", name: "Trabajo", color: "#7C3F82", icon: "", has_timer: true,
  weekly_goal_minutes: 2400, weekly_goal_sessions: null,
};
const ev = (p: Partial<CalendarEvent>): CalendarEvent => ({
  id: crypto.randomUUID(), user_id: "u", activity_type_id: "w", title: "x", notes: null, location: null,
  starts_at: "", ends_at: "", all_day: false, rrule: null, source: "outlook", external_id: null, etag: null,
  status: "planned", metadata: {}, ...p,
});
const ses = (p: Partial<TimeSession>): TimeSession => ({
  id: crypto.randomUUID(), user_id: "u", activity_type_id: "w", event_id: null, source: "holded",
  external_id: null, started_at: "", ended_at: null, pauses: [], notes: null, ...p,
});

describe("reconcileWork", () => {
  const now = new Date("2026-10-14T12:00:00Z");

  it("detecta reuniones fuera del fichaje y horas extra", () => {
    const [d] = reconcileWork({
      days: ["2026-10-12"], types: [work], now,
      events: [ev({ starts_at: "2026-10-12T16:00:00Z", ends_at: "2026-10-12T17:00:00Z" })],
      sessions: [ses({ started_at: "2026-10-12T06:00:00Z", ended_at: "2026-10-12T16:30:00Z" })],
    });
    expect(d.clocked).toBe(630);
    expect(d.expected).toBe(480);
    expect(d.meetingsOutsideClock).toBe(30);
    expect(d.flags).toEqual(expect.arrayContaining(["overtime", "meetings_outside"]));
  });

  it("marca día laborable sin fichaje", () => {
    const [d] = reconcileWork({ days: ["2026-10-13"], types: [work], events: [], sessions: [], now });
    expect(d.flags).toContain("no_clock");
  });

  it("no exige nada en fin de semana", () => {
    const [d] = reconcileWork({ days: ["2026-10-11"], types: [work], events: [], sessions: [], now });
    expect(d.expected).toBe(0);
    expect(d.flags).toEqual([]);
  });
});

describe("fichajes olvidados", () => {
  it("un fichaje abierto de un día pasado no suma horas y se marca", () => {
    const [d] = reconcileWork({
      days: ["2026-10-09"], types: [work], events: [], now: new Date("2026-10-11T20:00:00Z"),
      sessions: [ses({ started_at: "2026-10-09T07:00:00Z", ended_at: null })],
    });
    expect(d.clocked).toBe(0);
    expect(d.flags).toContain("open_clock");
  });
  it("un fichaje abierto de hoy cuenta hasta ahora", () => {
    const [d] = reconcileWork({
      days: ["2026-10-12"], types: [work], events: [], now: new Date("2026-10-12T09:00:00Z"),
      sessions: [ses({ started_at: "2026-10-12T07:00:00Z", ended_at: null })],
    });
    expect(d.clocked).toBe(120);
  });
});

describe("días futuros", () => {
  it("no avisan ni calculan diferencia aunque tengan reuniones", () => {
    const [d] = reconcileWork({
      days: ["2026-10-14"], types: [work], now: new Date("2026-10-12T09:00:00Z"), sessions: [],
      events: [ev({ starts_at: "2026-10-14T08:00:00Z", ends_at: "2026-10-14T09:00:00Z" })],
    });
    expect(d).toMatchObject({ future: true, delta: null, flags: [] });
  });
  it("hoy avisa de 'sin fichar' solo cuando ya empezó una reunión", () => {
    const meeting = ev({ starts_at: "2026-10-12T10:00:00Z", ends_at: "2026-10-12T11:00:00Z" });
    const before = reconcileWork({ days: ["2026-10-12"], types: [work], now: new Date("2026-10-12T09:00:00Z"), sessions: [], events: [meeting] });
    const after = reconcileWork({ days: ["2026-10-12"], types: [work], now: new Date("2026-10-12T10:30:00Z"), sessions: [], events: [meeting] });
    expect(before[0].flags).toEqual([]);
    expect(after[0].flags).toContain("no_clock");
  });
});
