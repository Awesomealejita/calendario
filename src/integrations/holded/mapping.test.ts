import { describe, expect, it } from "vitest";
import { holdedTimeToSession } from "./mapping";

describe("holdedTimeToSession", () => {
  it("acepta timestamps Unix en segundos y pausas", () => {
    const s = holdedTimeToSession(
      { id: "h1", startTmp: 1760252400, endTmp: "1760281200", pauses: [{ startTmp: 1760263200, endTmp: 1760266800 }] },
      "u",
      "w",
    );
    expect(s).toMatchObject({
      external_id: "h1",
      started_at: "2025-10-12T07:00:00.000Z",
      ended_at: "2025-10-12T15:00:00.000Z",
      pauses: [{ start: "2025-10-12T10:00:00.000Z", end: "2025-10-12T11:00:00.000Z" }],
    });
  });
  it("acepta ISO y fichaje abierto", () => {
    expect(holdedTimeToSession({ _id: "h2", start: "2026-10-12T07:00:00Z" }, "u", null)).toMatchObject({ ended_at: null });
  });
  it("descarta registros sin inicio", () => {
    expect(holdedTimeToSession({ id: "x" }, "u", null)).toBeNull();
  });
});
