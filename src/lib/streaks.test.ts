import { describe, expect, it } from "vitest";
import { achievements, bestStreak, perfectClockStreak, weekStreak, weeklyHistory } from "./streaks";
import type { TimeSession } from "./types";
import type { DayBalance } from "./reconcile";

const gym = { id: "g", weekly_goal_sessions: 2, weekly_goal_minutes: null };
const ses = (start: string): TimeSession => ({
  id: start, user_id: "u", activity_type_id: "g", event_id: null, source: "timer", external_id: null,
  started_at: start, ended_at: new Date(Date.parse(start) + 3600000).toISOString(), pauses: [], notes: null,
});
// Miércoles 14/10/2026.
const now = new Date("2026-10-14T10:00:00Z");

describe("rachas", () => {
  it("cuenta semanas seguidas y no rompe por la semana en curso", () => {
    const sessions = [
      ses("2026-09-22T17:00:00Z"), ses("2026-09-24T17:00:00Z"), // semana 21/9 ✔
      ses("2026-09-29T17:00:00Z"), ses("2026-10-01T17:00:00Z"), // semana 28/9 ✔
      ses("2026-10-06T17:00:00Z"), ses("2026-10-08T17:00:00Z"), // semana 5/10 ✔
      ses("2026-10-13T17:00:00Z"), // semana actual: 1/2, en curso
    ];
    const h = weeklyHistory(gym, sessions, now, 6, "Europe/Madrid");
    expect(h.map((w) => w.sessions)).toEqual([0, 0, 2, 2, 2, 1]);
    expect(h.at(-1)).toMatchObject({ current: true, met: false, weekStart: "2026-10-12" });
    expect(weekStreak(h)).toBe(3);
    expect(bestStreak(h)).toBe(3);
  });

  it("una semana pasada sin cumplir rompe la racha", () => {
    const h = weeklyHistory(gym, [ses("2026-09-29T17:00:00Z"), ses("2026-10-01T17:00:00Z")], now, 4, "Europe/Madrid");
    expect(weekStreak(h)).toBe(0);
  });

  it("fichaje perfecto: días laborables pasados seguidos", () => {
    const d = (day: string, clocked: number, flags: DayBalance["flags"] = []): DayBalance => ({
      day, clocked, tracked: 0, meetings: 0, meetingsOutsideClock: 0, planned: 0, expected: 480, delta: 0, future: false, flags,
    });
    const balances = [d("2026-10-09", 480), d("2026-10-12", 470), d("2026-10-13", 490), d("2026-10-08", 0, ["no_clock"]), d("2026-10-14", 0)];
    expect(perfectClockStreak(balances, now, "Europe/Madrid")).toBe(3);
  });

  it("logros con progreso", () => {
    const list = achievements({ totalGymSessions: 7, totalGymMinutes: 420, gymStreak: 1, bestGymStreak: 4, clockStreak: 2, totalSets: 0 });
    expect(list.find((a) => a.id === "first")?.unlocked).toBe(true);
    expect(list.find((a) => a.id === "ten")?.progress).toBeCloseTo(0.7);
    expect(list.find((a) => a.id === "streak4")?.unlocked).toBe(true);
  });
});
