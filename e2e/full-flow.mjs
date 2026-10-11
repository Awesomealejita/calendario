/**
 * Prueba de punta a punta contra el entorno local de scripts/local.sh (modo demo).
 *   node e2e/full-flow.mjs [carpetaCapturas]
 * Requiere Chromium de Playwright (PW_CHROMIUM=/ruta/chromium si no está en la ruta por defecto).
 */
import { chromium } from "playwright-core";
import { readFileSync, mkdirSync } from "node:fs";

const APP = process.env.APP_URL || "http://localhost:3000";
const OUT = process.argv[2] || "e2e/screenshots";
// E2E_CLOUD=1: contra el despliegue real (sin simulador): se saltan Outlook/Holded/Claude simulados
// y se usa un usuario temporal que se borra al final.
const CLOUD = process.env.E2E_CLOUD === "1";
const EMAIL = CLOUD ? `e2e-${Date.now()}@example.com` : process.env.MOCK_EMPLOYEE_EMAIL || "yo@example.com";
mkdirSync(OUT, { recursive: true });
const env = Object.fromEntries(
  readFileSync(process.env.E2E_ENV_FILE || ".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

// Datos simulados limpios en cada ejecución.
if (!CLOUD) await fetch("http://localhost:4010/__reset", { method: "POST" }).catch(() => {});

// Precalienta las rutas: en `next dev` la primera compilación de cada página puede tardar.
for (const r of ["/login", "/calendar", "/timer", "/insights", "/settings", "/api/events?start=a&end=b"]) {
  await fetch(`${APP}${r}`, { redirect: "manual" }).catch(() => {});
}

const results = [];
const NEEDS_MOCKS = [
  "Conectar Outlook", "Plan B ICS", "Conectar Holded", "El calendario muestra reuniones", "Crear evento de trabajo y enviarlo",
  "Completar una tarea de To Do", "Cronómetro de trabajo ficha en Holded", "Chat del asistente",
];
const step = async (name, fn) => {
  if (CLOUD && NEEDS_MOCKS.some((n) => name.startsWith(n))) {
    results.push(["⏭️", name]);
    console.log("⏭️", name, "(necesita el simulador)");
    return;
  }
  try {
    await fn();
    results.push(["✅", name]);
    console.log("✅", name);
  } catch (e) {
    results.push(["❌", name, e.message.split("\n")[0]]);
    await page.screenshot({ path: `${OUT}/fallo-${results.length}.png`, fullPage: true }).catch(() => {});
    console.log("❌", name, "→", e.message.split("\n")[0]);
  }
};
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: "es-ES", timezoneId: "Europe/Madrid" });
const page = await ctx.newPage();
page.setDefaultTimeout(30000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await step("Sin sesión redirige a /login", async () => {
  await page.goto(`${APP}/calendar`);
  await page.waitForURL(/\/login/);
});

const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const admin = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };
const createdUserIds = [];
const PASSWORD = "prueba-e2e-" + Math.random().toString(36).slice(2, 10);

await step("Login con email y contraseña (cuenta creada por admin)", async () => {
  const r = await fetch(`${SUPA}/auth/v1/admin/users`, { method: "POST", headers: admin, body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }) });
  expect(r.ok, `crear usuario: ${r.status}`);
  createdUserIds.push((await r.json()).id);
  await page.fill("#email", EMAIL);
  await page.fill("#password", "incorrecta");
  await page.click('button:has-text("Entrar")');
  await page.waitForSelector("text=Email o contraseña incorrectos");
  await page.fill("#password", PASSWORD);
  await page.click('button:has-text("Entrar")');
  await page.waitForURL(/\/calendar/);
  await page.screenshot({ path: `${OUT}/01-calendario-vacio.png` });
});

await step("Enlace por email: abre sesión en otro navegador y no se puede reutilizar", async () => {
  const link = await (await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: admin, body: JSON.stringify({ type: "magiclink", email: EMAIL }) })).json();
  const other = await browser.newContext();
  const p = await other.newPage();
  await p.goto(`${APP}/auth/callback?token_hash=${link.hashed_token}&type=email`);
  await p.waitForURL(/\/calendar/);
  await p.goto(`${APP}/auth/callback?token_hash=${link.hashed_token}&type=email`);
  await p.waitForURL(/error=link/);
  await other.close();
});

await step("Conectar Outlook (OAuth simulado) y sincronizar reuniones + To Do", async () => {
  await page.goto(`${APP}/settings`);
  await page.click("text=Conectar con Microsoft");
  await page.waitForURL(/outlook=connected/);
  await page.waitForSelector("text=Outlook conectado");
  await page.waitForSelector("text=Última sincronización");
});

await step("Plan B ICS: importar calendario publicado", async () => {
  await page.fill('input[aria-label="URL ICS"]', "http://localhost:4010/ics/calendar.ics");
  await page.getByRole("button", { name: "Guardar" }).first().click();
  await page.waitForSelector("text=/Importados \\d+ eventos/");
});

await step("Conectar Holded (busca el empleado por email) e importar fichajes", async () => {
  await page.fill('input[aria-label="API key de Holded"]', "mock-holded-api-key");
  await page.click("text=Conectar Holded");
  await page.waitForSelector("text=/Conectado como Yo\\. \\d+ fichajes importados/");
  await page.screenshot({ path: `${OUT}/02-ajustes.png`, fullPage: true });
});

await step("El calendario muestra reuniones de Outlook e ICS", async () => {
  await page.goto(`${APP}/calendar`);
  await page.waitForSelector(".fc-event >> text=Daily del equipo");
  await page.waitForSelector("text=Enviar informe mensual"); // To Do
});

await step("Crear un gym ayer a las 18:00 desde el formulario", async () => {
  await page.click("text=+ Gym");
  await page.fill("#ev-title", "Pierna");
  const y = new Date(Date.now() - 86400000);
  const pad = (n) => String(n).padStart(2, "0");
  const d = `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`;
  await page.fill("#ev-start", `${d}T18:00`);
  await page.fill("#ev-end", `${d}T19:00`);
  await page.click("form >> text=Guardar");
  await page.waitForSelector("#ev-title", { state: "detached" });
  // "Ayer" puede caer en la semana anterior: se comprueba en la vista de agenda de esa fecha.
  await page.click("text=Agenda");
  if (!(await page.locator(".fc-event >> text=Pierna").count())) await page.click('button[title="Semana anterior"], .fc-prev-button');
  await page.waitForSelector(".fc-event >> text=Pierna");
  await page.click(".fc-today-button").catch(() => {});
  await page.click("text=Semana");
  await page.screenshot({ path: `${OUT}/03-calendario-semana.png` });
});

await step("Crear evento de trabajo y enviarlo también a Outlook", async () => {
  await page.click("text=+ Nuevo");
  await page.click('form >> button:has-text("Trabajo")');
  await page.fill("#ev-title", "Bloque foco");
  await page.check("text=Crear también en Outlook");
  await page.click("form >> text=Guardar");
  await page.waitForSelector("#ev-title", { state: "detached" });
  await page.waitForSelector(".fc-event >> text=Bloque foco");
});

await step("Completar una tarea de To Do (se propaga a Outlook)", async () => {
  await page.click('input[aria-label="Completar Revisar contrato proveedor"]');
  await page.waitForSelector("text=Revisar contrato proveedor", { state: "detached" });
});

await step("Cronómetro de gym: empezar, pausar, seguir y terminar", async () => {
  await page.goto(`${APP}/timer`);
  const gym = page.locator("section", { has: page.locator("h2", { hasText: "Gym" }) });
  await gym.getByRole("button", { name: /Empezar/ }).click();
  await gym.getByRole("button", { name: /Terminar/ }).waitFor();
  await page.waitForTimeout(2100);
  await gym.getByRole("button", { name: /Pausa/ }).click();
  await gym.getByRole("button", { name: /Seguir/ }).click();
  await gym.getByRole("button", { name: /Pausa/ }).waitFor();
  await page.screenshot({ path: `${OUT}/04-cronometro.png` });
  await gym.getByRole("button", { name: /Terminar/ }).click();
  await gym.getByRole("button", { name: /Empezar/ }).waitFor();
});

await step("Cronómetro de trabajo ficha en Holded (entrada y salida)", async () => {
  const work = page.locator("section", { has: page.locator("h2", { hasText: "Trabajo" }) });
  expect(await work.locator('input[type="checkbox"]').isChecked(), "Holded debería estar marcado");
  await work.getByRole("button", { name: /Empezar/ }).click();
  await work.getByRole("button", { name: /Terminar/ }).waitFor();
  expect(!(await page.locator("text=No se pudo fichar").count()), "falló el fichaje");
  await work.getByRole("button", { name: /Terminar/ }).click();
  await work.getByRole("button", { name: /Empezar/ }).waitFor();
});

await step("La API de eventos valida los parámetros", async () => {
  const r = await page.evaluate(async () => (await fetch("/api/events?start=x")).status);
  expect(r === 400, "validación de /api/events");
});

await step("Asistente: analizar, ver sugerencias y cuadre de horas", async () => {
  await page.goto(`${APP}/insights`);
  await page.click("text=Analizar ahora");
  await page.waitForSelector(CLOUD ? "text=Recupera la sesión" : "text=[Simulado] Recupera el gym");
  await page.waitForSelector("text=Cuadre de horas");
  if (CLOUD) return void (await page.screenshot({ path: `${OUT}/05-asistente.png`, fullPage: true }));
  // Los avisos de días pasados pueden estar en la semana anterior (p. ej. si hoy es lunes).
  if (!(await page.locator("td >> text=Fichaje abierto").count())) await page.click('a[aria-label="Semana anterior"]');
  await page.waitForSelector("td >> text=Sin fichar");
  await page.waitForSelector("td >> text=Fichaje abierto");
  await page.screenshot({ path: `${OUT}/05-asistente.png`, fullPage: true });
});

await step("Aceptar sugerencia crea el gym en un hueco libre", async () => {
  await page.click("text=Añadir al calendario");
  await page.waitForSelector(CLOUD ? "text=Recupera la sesión" : "text=[Simulado] Recupera el gym", { state: "detached" });
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/events?title=eq.Gym%20(recuperaci%C3%B3n)&select=id,metadata,user_id`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  const rows = (await r.json()).filter((x) => x.user_id === createdUserIds[0]);
  expect(rows.length === 1 && rows[0].metadata.createdBy === "ai", `esperaba 1 evento IA, hay ${rows.length}`);
});

await step("El gym de ayer se marcó como 'no acudido'", async () => {
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/events?title=eq.Pierna&select=status,user_id`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  const ev = (await r.json()).find((x) => x.user_id === createdUserIds[0]);
  expect(ev?.status === "missed", `estado: ${ev?.status}`);
});

await step("Chat del asistente responde", async () => {
  await page.click("text=¿Cuándo encajo el gym esta semana?");
  await page.waitForSelector("text=[Respuesta simulada]");
});

await step("Crons protegidos: 401 sin secreto, 200 con secreto", async () => {
  expect((await fetch(`${APP}/api/cron/sync`)).status === 401, "sync sin secreto");
  const h = { Authorization: `Bearer ${env.CRON_SECRET}` };
  const s = await fetch(`${APP}/api/cron/sync`, { headers: h });
  const sj = await s.json();
  expect(s.status === 200 && sj.failed === 0, `sync ${s.status} ${JSON.stringify(sj)}`);
  const i = await fetch(`${APP}/api/cron/insights`, { headers: h });
  expect(i.status === 200, `insights ${i.status}`);
});

await step("Otro usuario no ve tus datos (RLS)", async () => {
  const otherEmail = `otro-${Date.now()}@example.com`;
  const created = await (await fetch(`${SUPA}/auth/v1/admin/users`, { method: "POST", headers: admin, body: JSON.stringify({ email: otherEmail, password: PASSWORD, email_confirm: true }) })).json();
  createdUserIds.push(created.id);
  const session = await (
    await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email: otherEmail, password: PASSWORD }),
    })
  ).json();
  const token = session.access_token;
  expect(token, "no se pudo iniciar sesión con el segundo usuario");
  const get = async (t) =>
    (await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${t}?select=*`, { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } })).json();
  expect((await get("events")).length === 0, "ve eventos ajenos");
  expect((await get("time_sessions")).length === 0, "ve sesiones ajenas");
  expect((await get("activity_types")).length === 4, "debería tener solo sus 4 módulos");
  const sec = await get("integration_secrets");
  expect(Array.isArray(sec) && sec.length === 0, "ve secretos");
});

await step("Vista móvil (PWA) y modo oscuro", async () => {
  for (const scheme of ["light", "dark"]) {
    const m = await browser.newContext({ ...{ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, colorScheme: scheme, locale: "es-ES", timezoneId: "Europe/Madrid", storageState: await ctx.storageState() });
    const p = await m.newPage();
    await p.goto(`${APP}/calendar`);
    await p.waitForSelector(".fc-event");
    await p.screenshot({ path: `${OUT}/06-movil-calendario-${scheme}.png` });
    await p.goto(`${APP}/insights`);
    await p.waitForSelector("text=Cuadre de horas");
    await p.screenshot({ path: `${OUT}/07-movil-asistente-${scheme}.png`, fullPage: true });
    await m.close();
  }
  const man = await (await fetch(`${APP}/manifest.webmanifest`)).json();
  expect(man.display === "standalone" && man.icons.length >= 2, "manifest PWA");
});

await step("Sin errores de JavaScript en el navegador", async () => {
  expect(errors.length === 0, errors.join(" | "));
});

await browser.close();
// Limpieza: borra los usuarios de prueba (y en cascada todos sus datos).
for (const id of createdUserIds) await fetch(`${SUPA}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: admin });
const failed = results.filter((r) => r[0] === "❌");
console.log(`\n${results.length - failed.length}/${results.length} pasos OK`);
process.exit(failed.length ? 1 : 0);
