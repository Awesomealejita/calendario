-- Sincronización cada 10 minutos desde Supabase (gratis, sin depender del plan de Vercel).
-- Ejecuta esto UNA vez en el SQL Editor de Supabase sustituyendo <APP_URL> y <CRON_SECRET>.
-- Vercel Cron (vercel.json) cubre la sincronización diaria y el análisis nocturno de la IA.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'calendario-sync',
  '*/10 * * * *',
  $$
  select net.http_get(
    url := '<APP_URL>/api/cron/sync',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'),
    timeout_milliseconds := 60000
  );
  $$
);

-- Para quitarlo: select cron.unschedule('calendario-sync');
