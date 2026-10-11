/**
 * Prueba de punta a punta contra el entorno local de scripts/local.sh (modo demo).
 *   node e2e/full-flow.mjs [carpetaCapturas]
 * Requiere Chromium de Playwright (PW_CHROMIUM=/ruta/chromium si no está en la ruta por defecto).
 */
import { chromium } from "playwright-core";
import { readFileSync, mkdirSync } from "node:fs";

const APP = process.env.APP_URL || "http://localhost:3000";
const MAIL = "http://127.0.0.1:54324";
const OUT = process.argv[2] || "e2e/screenshots";
const EMAIL = process.env.MOCK_EMPLOYEE_EMAIL || "yo@example.com";
mkdirSync(OUT, { recursive: true });
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

// Precalienta las rutas: en `next dev` la primera compilación de cada página puede tardar.
for (const r of ["/login", "/calendar", "/timer", "/insights", "/settings", "/api/events?start=a&end=b"]) {
  await fetch(`${APP}${r}`, { redirect: "manual" }).catch(() => {});
}

const results = [];
const step = async (name, fn) => {
  try {
    await fn();
    results.push(["✅", name]);
    console.log("✅", name);
  } catch (e) {
    results.push(["❌", name, e.message.split("\n")[0]]);
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

await step("Login con enlace mágico (correo en Mailpit)", async () => {
  await fetch(`${MAIL}/api/v1/messages`, { method: "DELETE" });
  await page.fill("#email", EMAIL);
  await page.click("text=Entrar con enlace mágico");
  await page.waitForSelector("text=Revisa tu correo");
  let msg;
  for (let i = 0; i < 20 && !msg; i++) {
    const list = await (await fetch(`${MAIL}/api/v1/messages`)).json();
    msg = list.messages?.[0];
    if (!msg) await new Promise((r) => setTimeout(r, 500));
  }
  expect(msg, "no llegó el correo");
  const full = await (await fetch(`${MAIL}/api/v1/message/${msg.ID}`)).json();
  const link = (full.Text.match(/https?:\/\/\S+verify\S+/) || [])[0];
  expect(link, "no hay enlace en el correo");
  await page.goto(link.replace(/&amp;/g, "&"));
  await page.waitForURL(/\/calendar/);
  await page.screenshot({ path: `${OUT}/01-calendario-vacio.png` });
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
  await page.waitForSelector(".fc-event >> text=Pierna");
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
  await page.waitForSelector("text=[Simulado] Recupera el gym");
  await page.waitForSelector("text=Sin fichar");
  await page.waitForSelector("text=Fichaje abierto");
  await page.screenshot({ path: `${OUT}/05-asistente.png`, fullPage: true });
});

await step("Aceptar sugerencia crea el gym en un hueco libre", async () => {
  await page.click("text=Añadir al calendario");
  await page.waitForSelector("text=[Simulado] Recupera el gym", { state: "detached" });
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/events?title=eq.Gym%20(recuperaci%C3%B3n)&select=id,metadata`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  const rows = await r.json();
  expect(rows.length === 1 && rows[0].metadata.createdBy === "ai", `esperaba 1 evento IA, hay ${rows.length}`);
});

await step("El gym de ayer se marcó como 'no acudido'", async () => {
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/events?title=eq.Pierna&select=status`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  const [ev] = await r.json();
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
  const other = await (
    await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/signup`, {
      method: "POST",
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email: `otro${Date.now()}@example.com`, password: "contraseña-segura-123" }),
    })
  ).json();
  const token = other.access_token;
  expect(token, "no se pudo crear el segundo usuario");
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
const failed = results.filter((r) => r[0] === "❌");
console.log(`\n${results.length - failed.length}/${results.length} pasos OK`);
process.exit(failed.length ? 1 : 0);
