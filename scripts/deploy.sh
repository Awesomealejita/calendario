#!/usr/bin/env bash
# Despliega en Vercel (producción) leyendo las claves de .env.cloud.local (no se sube al repo).
# Necesita en ese fichero: VERCEL_TOKEN, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# SUPABASE_SERVICE_ROLE_KEY. Genera y guarda ahí el resto de secretos la primera vez.
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE=.env.cloud.local
[ -f "$ENV_FILE" ] || { echo "Falta $ENV_FILE"; exit 1; }
umask 077
set -a; . "./$ENV_FILE"; set +a
VERCEL="npx --yes vercel@63.1.2"
PROJECT="${VERCEL_PROJECT:-calendario}"

add_if_missing() { grep -q "^$1=" "$ENV_FILE" || echo "$1=$2" >> "$ENV_FILE"; }
add_if_missing ENCRYPTION_KEY "$(openssl rand -base64 48 | tr -d '\n')"
add_if_missing CRON_SECRET "$(openssl rand -hex 32)"
if ! grep -q "^VAPID_PRIVATE_KEY=" "$ENV_FILE"; then
  VAPID=$(npx --yes web-push generate-vapid-keys --json)
  echo "NEXT_PUBLIC_VAPID_PUBLIC_KEY=$(node -pe 'JSON.parse(process.argv[1]).publicKey' "$VAPID")" >> "$ENV_FILE"
  echo "VAPID_PRIVATE_KEY=$(node -pe 'JSON.parse(process.argv[1]).privateKey' "$VAPID")" >> "$ENV_FILE"
fi
add_if_missing NEXT_PUBLIC_TIMEZONE "Europe/Madrid"
add_if_missing VAPID_SUBJECT "mailto:calendario@example.com"
set -a; . "./$ENV_FILE"; set +a

$VERCEL link --yes --project "$PROJECT" --token "$VERCEL_TOKEN" >/dev/null

set_env() {
  [ -n "${2:-}" ] || return 0
  $VERCEL env rm "$1" production --yes --token "$VERCEL_TOKEN" >/dev/null 2>&1 || true
  printf '%s' "$2" | $VERCEL env add "$1" production --token "$VERCEL_TOKEN" >/dev/null
  echo "  · $1"
}
echo "Variables de entorno:"
for v in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY ENCRYPTION_KEY CRON_SECRET \
         NEXT_PUBLIC_VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_SUBJECT NEXT_PUBLIC_TIMEZONE NEXT_PUBLIC_APP_URL \
         ANTHROPIC_API_KEY MS_CLIENT_ID MS_CLIENT_SECRET MS_TENANT_ID; do
  set_env "$v" "${!v:-}"
done

echo "Desplegando…"
URL=$($VERCEL deploy --prod --yes --token "$VERCEL_TOKEN")
echo "Desplegado: $URL"
