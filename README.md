# Calendario

Agenda personal modular (PWA instalable en el móvil) para **gym, trabajo, citas y quehaceres**, con:

- **Outlook / Microsoft 365**: reuniones y tareas de To Do sincronizadas en ambos sentidos (Microsoft Graph). Si tu empresa bloquea apps, **plan B por ICS** (solo lectura).
- **Holded (fichajes)**: importa tus fichajes, ficha entrada/salida/pausa desde el cronómetro de trabajo y **cuadra** fichajes vs. reuniones vs. plan, día a día.
- **Cronómetro** para gym y trabajo: hora real de inicio/fin con pausas. Se guarda en la base de datos, así que sobrevive a cerrar la app o cambiar de dispositivo, y se vincula solo al evento planificado.
- **Asistente IA (Claude)**: detecta lo que no cumples (no fuiste al gym, empiezas tarde, la jornada se alarga, olvidaste fichar…) y propone acciones concretas que aplicas con un toque (p. ej. "añadir gym mañana a las 19:00" en un hueco libre real). También tiene un chat ("¿cuándo encajo el gym esta semana?").
- Paleta: `#FFCF9C` `#FF8C6B` `#E8543F` `#7C3F82` `#2C2153`, con modo claro y oscuro.

## Arquitectura

| Pieza | Tecnología |
|---|---|
| App web + API | Next.js 16 (App Router, server actions), Tailwind CSS 4, FullCalendar |
| Móvil | PWA (Serwist): instalable, lectura offline de la agenda, notificaciones push |
| Datos y login | Supabase (Postgres + Auth con enlace mágico + Row Level Security) |
| Despliegue | Vercel (+ Vercel Cron) · `pg_cron` de Supabase para sincronizar cada 10 min |
| IA | Claude API (`@anthropic-ai/sdk`), salida estructurada validada con Zod |

```
src/
  app/(app)/        calendar · timer · insights · settings (páginas + server actions)
  app/api/          events · ai/chat · cron/{sync,insights} · integrations/outlook · push
  modules/          un módulo por tipo de actividad (gym, work, appointments, tasks) + registro y cronómetro
  integrations/     outlook (Graph, OAuth, ICS) · holded (Team API)
  ai/               motor de cumplimiento determinista + sugerencias + chat
  lib/              tiempo/zonas, cuadre de horas, cifrado, Supabase, push
supabase/migrations esquema + RLS + módulos por defecto
```

**Módulos**: cada tipo de actividad (`src/modules/<nombre>`) declara si usa cronómetro, si es flexible (la IA puede moverlo), el margen para darlo por "no acudido" y una pista para la IA. Desde Ajustes puedes crear categorías propias y fijar objetivos semanales (p. ej. gym 4 sesiones / 4 h).

**IA en dos capas**: `src/ai/adherence.ts` calcula de forma determinista qué falla (con tests) y los huecos libres; Claude solo redacta y prioriza a partir de ese informe. Cada acción que propone se valida (ids existentes, horario dentro de un hueco libre) antes de poder aplicarse. Sin `ANTHROPIC_API_KEY` funciona en modo básico con sugerencias generadas por reglas.

**Seguridad**: cada tabla tiene RLS por usuario. Los tokens de Outlook y la API key de Holded se cifran con AES-256-GCM y viven en una tabla sin políticas RLS (solo accesible con service role desde el servidor).

## Puesta en marcha

### 1. Supabase
1. Crea un proyecto en [supabase.com](https://supabase.com).
2. SQL Editor → ejecuta `supabase/migrations/0001_init.sql` (o `supabase db push` con la CLI).
3. Authentication → URL Configuration: añade `https://TU-APP/auth/callback` (y `http://localhost:3000/auth/callback`) a Redirect URLs.

### 2. Microsoft 365 (Outlook)
1. [Azure Portal → App registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps) → New registration.
   - Cuentas: "Cualquier directorio organizativo" (o solo tu organización).
   - Redirect URI (Web): `https://TU-APP/api/integrations/outlook/callback`.
2. Certificates & secrets → nuevo client secret → `MS_CLIENT_SECRET`. El Application (client) ID → `MS_CLIENT_ID`.
3. API permissions (delegados): `offline_access`, `User.Read`, `Calendars.ReadWrite`, `Tasks.ReadWrite`.
4. Si al conectar te dice que necesitas aprobación del administrador, pide a IT que conceda consentimiento a la app **o** usa el plan B: en Outlook web → Configuración → Calendario → Calendarios compartidos → Publicar calendario → copia el enlace ICS y pégalo en Ajustes.

### 3. Holded
Holded → Configuración → Desarrolladores → crea una API key y pégala en **Ajustes → Holded**. La app busca tu empleado por el email con el que entras (o indica tu ID de empleado).

> Los endpoints de fichaje usados (`/api/team/v1/employees/{id}/times`, `…/times/clockin|clockout|pause|unpause`) siguen la Team API de Holded. El formato de la respuesta de fichajes no está totalmente documentado, así que el mapeo (`src/integrations/holded/mapping.ts`) acepta varias formas; si tus fichajes no aparecen, revisa ahí el formato real.

### 4. Variables de entorno
Copia `.env.example` a `.env.local` y rellénalo. Claves útiles:

```bash
openssl rand -base64 48           # ENCRYPTION_KEY
openssl rand -hex 32              # CRON_SECRET
npx web-push generate-vapid-keys  # NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
```

### 5. Desarrollo local
```bash
npm install
npm run dev        # http://localhost:3000
npm test           # tests de dominio e integraciones
npm run lint && npm run typecheck
```

### 6. Despliegue en Vercel
1. Importa el repo en Vercel y añade las variables de entorno (con `NEXT_PUBLIC_APP_URL` = tu dominio).
2. `vercel.json` programa una sincronización diaria y el análisis nocturno de la IA (20:30 UTC), compatible con el plan gratuito.
3. Para sincronizar Outlook/Holded cada 10 min, ejecuta `supabase/cron.sql` en Supabase sustituyendo `<APP_URL>` y `<CRON_SECRET>`.

### 7. En el móvil
Abre la URL en el móvil → **Añadir a pantalla de inicio** (Safari en iPhone, Chrome en Android). Después, en Ajustes → Notificaciones, actívalas en ese dispositivo (en iPhone solo funcionan con la app ya instalada).
