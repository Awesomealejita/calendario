import { describe, expect, it } from "vitest";
import { expandIcs } from "./ics";

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
BEGIN:VEVENT
UID:daily-1
SUMMARY:Daily
DTSTART:20261012T073000Z
DTEND:20261012T074500Z
RRULE:FREQ=DAILY;COUNT=5
EXDATE:20261013T073000Z
END:VEVENT
BEGIN:VEVENT
UID:one-off
SUMMARY:Revisión trimestral
LOCATION:Sala 2
DTSTART:20261014T100000Z
DTEND:20261014T110000Z
END:VEVENT
END:VCALENDAR`;

describe("expandIcs", () => {
  it("expande recurrencias respetando EXDATE y rango", () => {
    const occ = expandIcs(ICS, new Date("2026-10-12T00:00:00Z"), new Date("2026-10-14T23:59:00Z"));
    const daily = occ.filter((o) => o.title === "Daily").map((o) => o.start);
    expect(daily).toEqual(["2026-10-12T07:30:00.000Z", "2026-10-14T07:30:00.000Z"]);
    const single = occ.find((o) => o.uid === "one-off");
    expect(single).toMatchObject({ location: "Sala 2", end: "2026-10-14T11:00:00.000Z" });
  });
});
