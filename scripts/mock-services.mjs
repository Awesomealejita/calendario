#!/usr/bin/env node
/**
 * Simulador local de Microsoft (login + Graph), Holded y la API de Claude para probar la app
 * de punta a punta sin credenciales reales. SOLO para desarrollo: nunca se usa en producción.
 *
 *   node scripts/mock-services.mjs            # escucha en http://localhost:4010
 *
 * Variables para apuntar la app aquí (ver scripts/local.sh):
 *   MS_LOGIN_BASE_URL=http://localhost:4010/ms   MS_GRAPH_BASE_URL=http://localhost:4010/graph/v1.0
 *   HOLDED_BASE_URL=http://localhost:4010/holded ANTHROPIC_BASE_URL=http://localhost:4010/anthropic
 */
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_PORT || 4010);
const EMPLOYEE_EMAIL = process.env.MOCK_EMPLOYEE_EMAIL || "yo@example.com";
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// Reuniones relativas a hoy (UTC) para que siempre haya datos frescos.
const day = (offset, h, m = 0) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  d.setUTCHours(h, m, 0, 0);
  return d;
};
const graphDate = (d) => ({ dateTime: d.toISOString().replace("Z", "0000"), timeZone: "UTC" });
const meetings = [];
for (let off = -6; off <= 6; off++) {
  const wd = day(off, 12).getUTCDay();
  if (wd === 0 || wd === 6) continue;
  meetings.push({ id: `daily-${off}`, subject: "Daily del equipo", start: graphDate(day(off, 7, 30)), end: graphDate(day(off, 7, 45)), onlineMeeting: { joinUrl: "https://teams.example/daily" } });
  if (off % 2 === 0) meetings.push({ id: `cliente-${off}`, subject: "Reunión con cliente", start: graphDate(day(off, 15)), end: graphDate(day(off, 16, 30)), location: { displayName: "Sala Norte" } });
  if (off === -2) meetings.push({ id: "tarde", subject: "Revisión que se alargó", start: graphDate(day(off, 16)), end: graphDate(day(off, 18)) });
}
meetings.push({ id: "rechazada", subject: "Comité (rechazada)", start: graphDate(day(1, 10)), end: graphDate(day(1, 11)), responseStatus: { response: "declined" } });
const createdEvents = new Map();
const todo = [
  { id: "t1", title: "Enviar informe mensual", status: "notStarted", dueDateTime: graphDate(day(-1, 17)) },
  { id: "t2", title: "Revisar contrato proveedor", status: "notStarted", dueDateTime: graphDate(day(3, 17)) },
];

// Fichajes de Holded en los últimos 5 días laborables: el más reciente sin cerrar,
// el anterior alargado hasta las 18:15 y el tercero sin fichar (para ver los avisos del cuadre).
const holdedTimes = [];
const pastWeekdays = [];
for (let off = -1; pastWeekdays.length < 5; off--) {
  const wd = day(off, 12).getUTCDay();
  if (wd !== 0 && wd !== 6) pastWeekdays.push(off);
}
pastWeekdays.forEach((off, i) => {
  if (i === 2) return;
  const end = i === 0 ? null : i === 1 ? day(off, 18, 15) : day(off, 15, 30);
  holdedTimes.push({
    id: `h${off}`,
    startTmp: Math.floor(day(off, 7, 0).getTime() / 1000),
    endTmp: end ? Math.floor(end.getTime() / 1000) : null,
    pauses: [{ startTmp: Math.floor(day(off, 11).getTime() / 1000), endTmp: Math.floor(day(off, 11, 30).getTime() / 1000) }],
  });
});

const ics = () => {
  const f = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//mock//ES",
    "BEGIN:VEVENT", "UID:ics-1on1", "SUMMARY:1:1 con responsable", `DTSTART:${f(day(1, 9))}`, `DTEND:${f(day(1, 9, 30))}`, "RRULE:FREQ=WEEKLY;COUNT=4", "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
};

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}
const readBody = (req) =>
  new Promise((r) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => r(b));
  });

function anthropicReply(body) {
  const base = { id: `msg_mock_${Date.now()}`, type: "message", role: "assistant", model: body.model, stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 100, output_tokens: 50 } };
  // Sugerencias estructuradas: usa ids y huecos reales del informe recibido.
  if (body.output_config?.format) {
    const text = body.messages.at(-1).content;
    const ctx = JSON.parse(String(typeof text === "string" ? text : text[0].text).split("\n").slice(1).join("\n").split("\n\nPropón")[0]);
    const gym = ctx.activityTypes.find((t) => t.module === "gym");
    const slot = ctx.freeSlots.find((s) => s.minutes >= 60);
    const none = { type: "none", eventId: null, activityTypeId: null, title: null, start: null, end: null, status: null };
    const suggestions = [];
    if (gym && slot) {
      suggestions.push({
        kind: "gym",
        title: "[Simulado] Recupera el gym",
        body: `Simulación: llevas ${ctx.weekly.find((w) => w.activityTypeId === gym.id)?.sessions ?? 0} sesiones esta semana. Te propongo el primer hueco libre.`,
        action: { ...none, type: "create_event", activityTypeId: gym.id, title: "Gym (recuperación)", start: slot.start, end: new Date(Date.parse(slot.start) + 3600000).toISOString() },
      });
    }
    const w = ctx.workBalance[0];
    if (w) suggestions.push({ kind: "work", title: "[Simulado] Revisa tus fichajes", body: `Simulación: el ${w.day} tienes avisos (${w.flags.join(", ")}).`, action: none });
    return { ...base, content: [{ type: "text", text: JSON.stringify({ suggestions }) }] };
  }
  return { ...base, content: [{ type: "text", text: `[Respuesta simulada] Has preguntado: "${body.messages.at(-1).content}". Con una ANTHROPIC_API_KEY real responderá Claude usando tu calendario.` }] };
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  const body = req.method === "GET" ? "" : await readBody(req);
  log(req.method, p);

  // --- Microsoft login ---
  if (/^\/ms\/[^/]+\/oauth2\/v2\.0\/authorize$/.test(p)) {
    const to = new URL(url.searchParams.get("redirect_uri"));
    to.searchParams.set("code", "mock-code");
    to.searchParams.set("state", url.searchParams.get("state"));
    res.writeHead(302, { Location: to.toString() });
    return res.end();
  }
  if (/^\/ms\/[^/]+\/oauth2\/v2\.0\/token$/.test(p)) return json(res, 200, { access_token: "mock-access", refresh_token: "mock-refresh", expires_in: 3600 });

  // --- Microsoft Graph ---
  if (p.startsWith("/graph/v1.0")) {
    const g = p.slice("/graph/v1.0".length);
    if (g === "/me/calendarView/delta") {
      const delta = url.searchParams.get("$deltatoken");
      const value = delta ? [] : [...meetings, ...createdEvents.values()];
      return json(res, 200, { value, "@odata.deltaLink": `http://localhost:${PORT}/graph/v1.0/me/calendarView/delta?$deltatoken=1` });
    }
    if (g === "/me/todo/lists") return json(res, 200, { value: [{ id: "lista", displayName: "Tareas" }] });
    if (g === "/me/todo/lists/lista/tasks") return json(res, 200, { value: todo.filter((t) => t.status !== "completed") });
    const t = g.match(/^\/me\/todo\/lists\/lista\/tasks\/(.+)$/);
    if (t && req.method === "PATCH") {
      Object.assign(todo.find((x) => x.id === t[1]) ?? {}, JSON.parse(body));
      return json(res, 200, {});
    }
    if (g === "/me/events" && req.method === "POST") {
      const ev = { ...JSON.parse(body), id: `creado-${createdEvents.size + 1}`, changeKey: "1" };
      createdEvents.set(ev.id, ev);
      return json(res, 201, ev);
    }
    const e = g.match(/^\/me\/events\/(.+)$/);
    if (e && req.method === "PATCH") return json(res, 200, { id: e[1] });
  }

  // --- Holded Team API ---
  if (p === "/holded/api/team/v1/employees") return json(res, 200, [{ id: "emp1", name: "Yo", lastName: "Demo", email: EMPLOYEE_EMAIL }, { id: "emp2", name: "Otra", email: "otra@example.com" }]);
  if (p === "/holded/api/team/v1/employees/emp1/times") return json(res, 200, holdedTimes);
  const h = p.match(/^\/holded\/api\/team\/v1\/employees\/emp1\/times\/(clockin|clockout|pause|unpause)$/);
  if (h) {
    const now = Math.floor(Date.now() / 1000);
    const open = holdedTimes.findLast((x) => !x.endTmp);
    if (h[1] === "clockin") holdedTimes.push({ id: `h-live-${now}`, startTmp: now, endTmp: null, pauses: [] });
    if (h[1] === "clockout" && open) open.endTmp = now;
    if (h[1] === "pause" && open) open.pauses.push({ startTmp: now, endTmp: null });
    if (h[1] === "unpause" && open) open.pauses.at(-1).endTmp = now;
    return json(res, 200, { status: 1 });
  }

  // --- Calendario ICS publicado ---
  if (p === "/ics/calendar.ics") {
    res.writeHead(200, { "Content-Type": "text/calendar" });
    return res.end(ics());
  }

  // --- API de Claude ---
  if (p === "/anthropic/v1/messages") return json(res, 200, anthropicReply(JSON.parse(body)));

  json(res, 404, { error: `mock: ruta no simulada ${req.method} ${p}` });
}).listen(PORT, () => log(`Simulador en http://localhost:${PORT}`));
