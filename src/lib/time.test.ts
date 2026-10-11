import { describe, expect, it } from "vitest";
import { dayKey, formatClock, formatDuration, matchEventForSession, overlapMinutes, sessionMinutes } from "./time";

describe("sessionMinutes", () => {
  it("descuenta las pausas", () => {
    expect(
      sessionMinutes({
        started_at: "2026-10-12T07:00:00Z",
        ended_at: "2026-10-12T08:30:00Z",
        pauses: [{ start: "2026-10-12T07:30:00Z", end: "2026-10-12T07:40:00Z" }],
      }),
    ).toBe(80);
  });
  it("cuenta una sesión abierta y una pausa abierta hasta now", () => {
    const now = new Date("2026-10-12T08:00:00Z");
    expect(
      sessionMinutes(
        { started_at: "2026-10-12T07:00:00Z", ended_at: null, pauses: [{ start: "2026-10-12T07:50:00Z", end: null }] },
        now,
      ),
    ).toBe(50);
  });
});

describe("helpers", () => {
  it("overlapMinutes", () => {
    expect(overlapMinutes("2026-01-01T09:00:00Z", "2026-01-01T10:00:00Z", "2026-01-01T09:30:00Z", "2026-01-01T11:00:00Z")).toBe(30);
    expect(overlapMinutes("2026-01-01T09:00:00Z", "2026-01-01T10:00:00Z", "2026-01-01T10:00:00Z", "2026-01-01T11:00:00Z")).toBe(0);
  });
  it("dayKey usa la zona horaria de Madrid", () => {
    expect(dayKey("2026-10-11T22:30:00Z", "Europe/Madrid")).toBe("2026-10-12");
  });
  it("formatos", () => {
    expect(formatDuration(135)).toBe("2h 15m");
    expect(formatDuration(-20)).toBe("-20m");
    expect(formatClock(3725)).toBe("01:02:05");
  });
});

describe("matchEventForSession", () => {
  const events = [
    { id: "a", activity_type_id: "gym", starts_at: "2026-10-12T17:00:00Z", ends_at: "2026-10-12T18:00:00Z", status: "planned" as const },
    { id: "b", activity_type_id: "work", starts_at: "2026-10-12T17:00:00Z", ends_at: "2026-10-12T18:00:00Z", status: "planned" as const },
  ];
  it("enlaza con el evento del mismo tipo cercano", () => {
    expect(matchEventForSession({ activity_type_id: "gym", started_at: "2026-10-12T16:40:00Z" }, events)).toBe("a");
  });
  it("no enlaza si está lejos", () => {
    expect(matchEventForSession({ activity_type_id: "gym", started_at: "2026-10-12T12:00:00Z" }, events)).toBeNull();
  });
});
