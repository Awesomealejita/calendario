import { describe, expect, it } from "vitest";
import { graphDateToIso, graphEventToRow, graphTaskToRow, rowToGraphEvent } from "./mapping";

describe("outlook mapping", () => {
  it("convierte fechas UTC de Graph", () => {
    expect(graphDateToIso({ dateTime: "2026-10-12T08:00:00.0000000", timeZone: "UTC" })).toBe("2026-10-12T08:00:00.000Z");
  });

  it("mapea un evento y marca cancelados/rechazados", () => {
    const row = graphEventToRow(
      {
        id: "AAMk",
        subject: "Daily",
        start: { dateTime: "2026-10-12T07:30:00.0000000", timeZone: "UTC" },
        end: { dateTime: "2026-10-12T07:45:00.0000000", timeZone: "UTC" },
        responseStatus: { response: "declined" },
        onlineMeeting: { joinUrl: "https://teams" },
      },
      "u",
      "w",
    )!;
    expect(row).toMatchObject({ title: "Daily", source: "outlook", external_id: "AAMk", status: "cancelled", activity_type_id: "w" });
    expect(row.metadata.joinUrl).toBe("https://teams");
  });

  it("mapea tareas de To Do", () => {
    expect(graphTaskToRow({ id: "t", title: "Informe", status: "completed" }, "u", "l", null)).toMatchObject({ done: true, due_at: null });
  });

  it("serializa evento local a Graph", () => {
    expect(rowToGraphEvent({ title: "X", notes: null, location: null, starts_at: "2026-10-12T07:00:00.000Z", ends_at: "2026-10-12T08:00:00.000Z", all_day: false }).start)
      .toEqual({ dateTime: "2026-10-12T07:00:00.000", timeZone: "UTC" });
  });
});
