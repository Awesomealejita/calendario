import { describe, expect, it } from "vitest";
import { validateAction } from "./schema";

const ctx = {
  eventIds: new Set(["e1"]),
  typeIds: new Set(["gym"]),
  slots: [{ start: "2026-10-13T16:00:00Z", end: "2026-10-13T20:00:00Z" }],
};
const base = { eventId: null, activityTypeId: null, title: null, start: null, end: null, status: null };

describe("validateAction", () => {
  it("acepta mover a un hueco libre", () => {
    const a = { ...base, type: "move_event" as const, eventId: "e1", start: "2026-10-13T17:00:00Z", end: "2026-10-13T18:00:00Z" };
    expect(validateAction(a, ctx).type).toBe("move_event");
  });
  it("rechaza horarios fuera de hueco o ids inventados", () => {
    expect(validateAction({ ...base, type: "move_event", eventId: "e1", start: "2026-10-13T09:00:00Z", end: "2026-10-13T10:00:00Z" }, ctx).type).toBe("none");
    expect(validateAction({ ...base, type: "mark_event_status", eventId: "zzz", status: "done" }, ctx).type).toBe("none");
    expect(validateAction({ ...base, type: "create_event", activityTypeId: "gym", title: "Gym", start: "2026-10-13T19:30:00Z", end: "2026-10-13T20:30:00Z" }, ctx).type).toBe("none");
  });
});
