-- Registro de entreno: series de cada sesión de gym (ejercicio, repeticiones, peso).
create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null references public.time_sessions (id) on delete cascade,
  exercise text not null check (char_length(exercise) between 1 and 80),
  reps integer check (reps between 0 and 1000),
  weight_kg numeric(6, 2) check (weight_kg between 0 and 1000),
  created_at timestamptz not null default now()
);
create index workout_sets_session_idx on public.workout_sets (session_id);
create index workout_sets_user_exercise_idx on public.workout_sets (user_id, exercise, created_at desc);

alter table public.workout_sets enable row level security;
create policy workout_sets_owner on public.workout_sets for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
