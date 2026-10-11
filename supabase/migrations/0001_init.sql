-- Calendario: esquema inicial. Todas las tablas son por usuario y protegidas con RLS.

-- Tipos de actividad (módulos). Los módulos "de fábrica" se crean al registrarse el usuario;
-- el usuario puede añadir categorías propias desde Ajustes.
create table public.activity_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  module text not null,                 -- gym | work | appointments | tasks | custom
  name text not null,
  color text not null,
  icon text not null default '•',
  has_timer boolean not null default false,
  weekly_goal_minutes integer,          -- p. ej. gym: 240 min/semana
  weekly_goal_sessions integer,         -- p. ej. gym: 4 sesiones/semana
  created_at timestamptz not null default now(),
  unique (user_id, module, name)
);

create type public.event_source as enum ('local', 'outlook', 'ics');
create type public.event_status as enum ('planned', 'done', 'missed', 'moved', 'cancelled');

create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  activity_type_id uuid references public.activity_types (id) on delete set null,
  title text not null,
  notes text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  rrule text,                           -- recurrencia RFC 5545 (opcional)
  source public.event_source not null default 'local',
  external_id text,                     -- id en Outlook / UID en ICS
  etag text,
  status public.event_status not null default 'planned',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at >= starts_at)
);
-- NULLs son distintos: los eventos locales sin external_id no chocan. No parcial para que funcione el upsert.
alter table public.events add constraint events_external_uq unique (user_id, source, external_id);
create index events_user_range_idx on public.events (user_id, starts_at, ends_at);

create type public.session_source as enum ('timer', 'holded');

-- Lo que realmente ocurrió (cronómetro o fichajes de Holded).
create table public.time_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  activity_type_id uuid references public.activity_types (id) on delete set null,
  event_id uuid references public.events (id) on delete set null,
  source public.session_source not null default 'timer',
  external_id text,
  started_at timestamptz not null,
  ended_at timestamptz,
  -- [{ "start": iso, "end": iso | null }]
  pauses jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.time_sessions add constraint time_sessions_external_uq unique (user_id, source, external_id);
-- Solo un cronómetro abierto por usuario y tipo.
create unique index time_sessions_one_open on public.time_sessions (user_id, activity_type_id)
  where ended_at is null and source = 'timer';
create index time_sessions_user_idx on public.time_sessions (user_id, started_at);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  activity_type_id uuid references public.activity_types (id) on delete set null,
  title text not null,
  due_at timestamptz,
  done boolean not null default false,
  source public.event_source not null default 'local',
  external_id text,
  external_list_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.tasks add constraint tasks_external_uq unique (user_id, source, external_id);

-- Estado de cada integración (sin secretos: ver integration_secrets).
create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,               -- outlook | ics | holded
  config jsonb not null default '{}'::jsonb,  -- ics_url, holded employee_id, delta links…
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (user_id, provider)
);

create type public.suggestion_status as enum ('open', 'accepted', 'dismissed');

create table public.suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  action jsonb,                         -- acción aplicable (ver src/ai/schema.ts)
  status public.suggestion_status not null default 'open',
  created_at timestamptz not null default now()
);
create index suggestions_user_idx on public.suggestions (user_id, status, created_at desc);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- RLS: cada usuario solo ve y toca lo suyo.
do $$
declare t text;
begin
  foreach t in array array['activity_types','events','time_sessions','tasks','integrations','suggestions','push_subscriptions']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t || '_owner', t);
  end loop;
end $$;

-- Secretos (tokens OAuth, API key de Holded) cifrados con AES-GCM por la app.
-- RLS activado SIN políticas: solo el service role (servidor) puede leerlos o escribirlos.
create table public.integration_secrets (
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  secret_enc text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);
alter table public.integration_secrets enable row level security;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger events_touch before update on public.events
  for each row execute function public.touch_updated_at();
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

-- Módulos por defecto al crear usuario. Colores = paleta de la app.
create or replace function public.seed_activity_types() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.activity_types (user_id, module, name, color, icon, has_timer, weekly_goal_sessions, weekly_goal_minutes) values
    (new.id, 'gym',          'Gym',     '#FF8C6B', '🏋️', true,  4,    240),
    (new.id, 'work',         'Trabajo', '#7C3F82', '💼', true,  null, 2400),
    (new.id, 'appointments', 'Citas',   '#E8543F', '📌', false, null, null),
    (new.id, 'tasks',        'Quehaceres', '#FFCF9C', '✅', false, null, null);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.seed_activity_types();
