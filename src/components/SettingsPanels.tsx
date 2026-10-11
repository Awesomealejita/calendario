"use client";
import { useState, useTransition } from "react";
import type { ActivityType } from "@/lib/types";
import { deleteActivityType, disconnect, saveActivityType, saveHolded, saveIcsUrl, syncNow } from "@/app/(app)/settings/actions";

interface IntegrationState {
  provider: string;
  last_synced_at: string | null;
  last_error: string | null;
  config: Record<string, unknown>;
}

const OUTLOOK_MSG: Record<string, string> = {
  connected: "Outlook conectado ✅",
  needs_admin: "Tu empresa exige aprobación del administrador para conectar apps. Usa la opción ICS de abajo mientras tanto (o pide a IT que apruebe la app).",
  missing_config: "Falta configurar MS_CLIENT_ID en el servidor.",
  bad_state: "La sesión de conexión caducó, inténtalo de nuevo.",
  error: "No se pudo conectar con Outlook.",
};

function useAction() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? (r.message ? { text: r.message, ok: true } : null) : { text: r.error ?? "Error", ok: false });
    });
  return { pending, msg, run };
}

const Msg = ({ m }: { m: { text: string; ok: boolean } | null }) =>
  m ? <p className={`mt-2 text-sm ${m.ok ? "text-plum dark:text-peach" : "text-red"}`}>{m.text}</p> : null;

const Status = ({ s }: { s?: IntegrationState }) =>
  s ? (
    <p className="text-xs text-muted">
      {s.last_error ? <span className="text-red">Error: {s.last_error}</span> : s.last_synced_at ? `Última sincronización: ${new Date(s.last_synced_at).toLocaleString("es-ES")}` : "Pendiente de sincronizar"}
    </p>
  ) : null;

export function IntegrationsPanel({ states, outlookParam }: { states: IntegrationState[]; outlookParam?: string }) {
  const by = (p: string) => states.find((s) => s.provider === p);
  const outlook = by("outlook");
  const ics = by("ics");
  const holded = by("holded");
  const [icsUrl, setIcsUrl] = useState(String(ics?.config.url ?? ""));
  const [apiKey, setApiKey] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const a = useAction();

  return (
    <section className="card space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">🔌 Integraciones</h2>
        <button className="btn-ghost text-xs" disabled={a.pending} onClick={() => a.run(syncNow)}>{a.pending ? "Sincronizando…" : "Sincronizar ahora"}</button>
      </div>
      <Msg m={a.msg} />

      <div>
        <h3 className="font-semibold">Outlook (Microsoft 365)</h3>
        <p className="mb-2 text-sm text-muted">Reuniones del calendario y tareas de To Do, en ambos sentidos. Se sincroniza cada 10 min.</p>
        {outlookParam && <p className={`mb-2 text-sm ${outlookParam === "connected" ? "text-plum dark:text-peach" : "text-red"}`}>{OUTLOOK_MSG[outlookParam] ?? outlookParam}</p>}
        {outlook ? (
          <div className="flex items-center justify-between gap-2">
            <Status s={outlook} />
            <button className="btn-ghost text-xs" onClick={() => confirm("¿Desconectar Outlook? Se borrarán sus eventos importados.") && a.run(() => disconnect("outlook"))}>Desconectar</button>
          </div>
        ) : (
          <a className="btn-primary" href="/api/integrations/outlook/connect">Conectar con Microsoft</a>
        )}
      </div>

      <div className="border-t border-border pt-4">
        <h3 className="font-semibold">Plan B: calendario publicado (ICS)</h3>
        <p className="mb-2 text-sm text-muted">
          Si tu empresa no deja conectar apps: Outlook web → Configuración → Calendario → Calendarios compartidos → Publicar calendario → copia el enlace ICS. Solo lectura.
        </p>
        <form className="flex gap-2" onSubmit={(e) => (e.preventDefault(), a.run(() => saveIcsUrl(icsUrl)))}>
          <input className="input" type="url" placeholder="https://outlook.office365.com/owa/calendar/…/calendar.ics" value={icsUrl} onChange={(e) => setIcsUrl(e.target.value)} aria-label="URL ICS" />
          <button className="btn-primary" disabled={a.pending || !icsUrl}>Guardar</button>
        </form>
        {ics && (
          <div className="mt-2 flex items-center justify-between">
            <Status s={ics} />
            <button className="btn-ghost text-xs" onClick={() => a.run(() => disconnect("ics"))}>Quitar</button>
          </div>
        )}
      </div>

      <div className="border-t border-border pt-4">
        <h3 className="font-semibold">Holded (fichajes)</h3>
        <p className="mb-2 text-sm text-muted">
          Importa tus fichajes para cuadrarlos con tus reuniones, y ficha entrada/salida desde el cronómetro de trabajo. API key en Holded → Configuración → Desarrolladores.
        </p>
        {holded ? (
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm">Empleado: <b>{String(holded.config.employeeName || holded.config.employeeId)}</b></p>
              <Status s={holded} />
            </div>
            <button className="btn-ghost text-xs" onClick={() => a.run(() => disconnect("holded"))}>Desconectar</button>
          </div>
        ) : (
          <form className="space-y-2" onSubmit={(e) => (e.preventDefault(), a.run(() => saveHolded(apiKey, employeeId || undefined)))}>
            <input className="input" type="password" autoComplete="off" placeholder="API key de Holded" value={apiKey} onChange={(e) => setApiKey(e.target.value)} aria-label="API key de Holded" />
            <input className="input" placeholder="ID de empleado (opcional, se busca por tu email)" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} aria-label="ID de empleado" />
            <button className="btn-primary" disabled={a.pending || !apiKey}>Conectar Holded</button>
          </form>
        )}
      </div>
    </section>
  );
}

export function TypesPanel({ types }: { types: ActivityType[] }) {
  const a = useAction();
  const [editing, setEditing] = useState<Partial<ActivityType> | null>(null);

  return (
    <section className="card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold">🧩 Módulos y objetivos</h2>
        <button className="btn-ghost text-xs" onClick={() => setEditing({ name: "", color: "#7C3F82", icon: "✨", has_timer: false, weekly_goal_sessions: null, weekly_goal_minutes: null })}>
          + Categoría
        </button>
      </div>
      <ul className="divide-y divide-border">
        {types.map((t) => (
          <li key={t.id} className="flex items-center gap-3 py-2">
            <span className="h-4 w-4 rounded-full" style={{ background: t.color }} />
            <span className="flex-1 text-sm font-semibold">{t.icon} {t.name}</span>
            <span className="text-xs text-muted">
              {t.has_timer && "⏱️ "}
              {t.weekly_goal_sessions ? `${t.weekly_goal_sessions}×/sem ` : ""}
              {t.weekly_goal_minutes ? `${Math.round(t.weekly_goal_minutes / 60)}h/sem` : ""}
            </span>
            <button className="text-xs font-semibold text-plum dark:text-peach" onClick={() => setEditing(t)}>Editar</button>
          </li>
        ))}
      </ul>
      {editing && (
        <form
          className="mt-4 space-y-3 rounded-2xl bg-surface-2 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            a.run(async () => {
              const r = await saveActivityType({
                id: editing.id,
                name: editing.name ?? "",
                color: editing.color ?? "#7C3F82",
                icon: editing.icon ?? "",
                has_timer: Boolean(editing.has_timer),
                weekly_goal_sessions: editing.weekly_goal_sessions || null,
                weekly_goal_minutes: editing.weekly_goal_minutes || null,
              });
              if (r.ok) setEditing(null);
              return r;
            });
          }}
        >
          <div className="grid grid-cols-[1fr_4rem_4rem] gap-2">
            <input className="input" placeholder="Nombre" required value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} aria-label="Nombre" />
            <input className="input text-center" value={editing.icon ?? ""} onChange={(e) => setEditing({ ...editing, icon: e.target.value })} aria-label="Icono" />
            <select className="input px-1" value={editing.color} onChange={(e) => setEditing({ ...editing, color: e.target.value })} aria-label="Color" style={{ background: editing.color }}>
              {["#FFCF9C", "#FF8C6B", "#E8543F", "#7C3F82", "#2C2153"].map((c) => (
                <option key={c} value={c} style={{ background: c }}>{c}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted">Sesiones/semana
              <input className="input mt-1" type="number" min={0} value={editing.weekly_goal_sessions ?? ""} onChange={(e) => setEditing({ ...editing, weekly_goal_sessions: e.target.value ? Number(e.target.value) : null })} />
            </label>
            <label className="text-xs text-muted">Horas/semana
              <input className="input mt-1" type="number" min={0} step={0.5} value={editing.weekly_goal_minutes ? editing.weekly_goal_minutes / 60 : ""} onChange={(e) => setEditing({ ...editing, weekly_goal_minutes: e.target.value ? Math.round(Number(e.target.value) * 60) : null })} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={Boolean(editing.has_timer)} onChange={(e) => setEditing({ ...editing, has_timer: e.target.checked })} /> Usa cronómetro
          </label>
          <div className="flex gap-2">
            <button className="btn-primary" disabled={a.pending}>Guardar</button>
            <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>Cancelar</button>
            {editing.id && editing.module === "custom" && (
              <button type="button" className="btn-ghost ml-auto text-red" onClick={() => a.run(async () => { const r = await deleteActivityType(editing.id!); if (r.ok) setEditing(null); return r; })}>Borrar</button>
            )}
          </div>
        </form>
      )}
      <Msg m={a.msg} />
    </section>
  );
}

export function PushPanel({ vapidKey }: { vapidKey: string | undefined }) {
  const [state, setState] = useState("");
  async function enable() {
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setState("Este navegador no admite notificaciones. En iPhone: añade la app a la pantalla de inicio primero.");
        return;
      }
      if ((await Notification.requestPermission()) !== "granted") return setState("Permiso denegado.");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey!) });
      const r = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub) });
      setState(r.ok ? "Notificaciones activadas ✅" : "No se pudo guardar la suscripción.");
    } catch (e) {
      setState((e as Error).message);
    }
  }
  return (
    <section className="card">
      <h2 className="font-bold">🔔 Notificaciones</h2>
      <p className="mb-3 text-sm text-muted">El asistente te avisa cuando detecta que te saltas el gym o se descuadran tus horas.</p>
      <button className="btn-primary" onClick={enable} disabled={!vapidKey}>Activar en este dispositivo</button>
      {!vapidKey && <p className="mt-2 text-xs text-muted">Falta NEXT_PUBLIC_VAPID_PUBLIC_KEY en el servidor.</p>}
      {state && <p className="mt-2 text-sm">{state}</p>}
    </section>
  );
}

function urlBase64ToUint8Array(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
