-- Endurecimiento según los asesores de Supabase (seguridad y rendimiento).

-- La función de trigger no debe depender del search_path del llamante.
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

-- seed_activity_types solo la ejecuta el trigger de auth.users: nadie debe llamarla por la API.
revoke execute on function public.seed_activity_types() from public, anon, authenticated;

-- Políticas RLS con (select auth.uid()) para que se evalúe una vez por consulta y no por fila.
alter policy activity_types_owner on public.activity_types to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy events_owner on public.events to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy time_sessions_owner on public.time_sessions to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy tasks_owner on public.tasks to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy integrations_owner on public.integrations to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy suggestions_owner on public.suggestions to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy push_subscriptions_owner on public.push_subscriptions to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Índices para claves foráneas.
create index if not exists events_activity_type_idx on public.events (activity_type_id);
create index if not exists tasks_activity_type_idx on public.tasks (activity_type_id);
create index if not exists time_sessions_activity_type_idx on public.time_sessions (activity_type_id);
create index if not exists time_sessions_event_idx on public.time_sessions (event_id);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- integration_secrets mantiene RLS sin políticas a propósito: solo el service role accede.
comment on table public.integration_secrets is 'Secretos cifrados; RLS sin políticas a propósito (solo service role).';
