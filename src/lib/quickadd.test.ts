import { describe, expect, it } from "vitest";
import { parseQuickAdd } from "./quickadd";

// Lunes 12/10/2026 10:00 en Madrid (08:00 UTC).
const now = new Date("2026-10-12T08:00:00Z");
const madrid = (iso: string) => new Date(iso).toLocaleString("es-ES", { timeZone: "Europe/Madrid", weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
const p = (s: string) => parseQuickAdd(s, now, "Europe/Madrid")!;

describe("parseQuickAdd", () => {
  it("gym mañana a las 7", () => {
    const d = p("gym mañana a las 7");
    expect(d).toMatchObject({ title: "Gym", module: "gym", hasTime: true });
    expect(madrid(d.start)).toBe("mar, 13/10, 07:00");
    expect(madrid(d.end)).toBe("mar, 13/10, 08:00");
  });
  it("dentista el jueves a las 17:30", () => {
    const d = p("dentista el jueves a las 17:30");
    expect(d).toMatchObject({ title: "Dentista", module: "appointments" });
    expect(madrid(d.start)).toBe("jue, 15/10, 17:30");
  });
  it("citas a la 1–7 sin indicar se entienden por la tarde", () => {
    expect(madrid(p("médico el viernes a las 5").start)).toBe("vie, 16/10, 17:00");
    expect(madrid(p("médico el viernes a las 9 de la mañana").start)).toBe("vie, 16/10, 09:00");
  });
  it("de la tarde, y media, duración y rangos", () => {
    expect(madrid(p("reunión con Marta hoy a las 4 y media de la tarde").start)).toBe("lun, 12/10, 16:30");
    expect(p("reunión con Marta hoy a las 4 y media de la tarde").title).toBe("Reunión con Marta");
    const r = p("formación el 20 de 9 a 14");
    expect(madrid(r.start)).toBe("mar, 20/10, 09:00");
    expect(madrid(r.end)).toBe("mar, 20/10, 14:00");
    const g = p("pierna pasado mañana 19h durante 90 min");
    expect(madrid(g.start)).toBe("mié, 14/10, 19:00");
    expect(madrid(g.end)).toBe("mié, 14/10, 20:30");
  });
  it("fecha con barra y sin hora → todo el día", () => {
    const d = p("renovar DNI 3/11");
    expect(d).toMatchObject({ allDay: true, hasTime: false, module: "tasks", title: "Renovar DNI" });
    expect(madrid(d.start)).toBe("mar, 3/11, 00:00");
  });
  it("el mismo día de la semana va a la semana siguiente", () => {
    expect(madrid(p("yoga el lunes a las 20").start)).toBe("lun, 19/10, 20:00");
  });
  it("mediodía y hasta las", () => {
    const d = p("comida con cliente mañana a mediodía hasta las 14");
    expect(madrid(d.start)).toBe("mar, 13/10, 12:00");
    expect(madrid(d.end)).toBe("mar, 13/10, 14:00");
    expect(d.module).toBe("work");
  });
  it("vacío", () => {
    expect(parseQuickAdd("   ", now)).toBeNull();
  });
});
