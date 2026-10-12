#!/usr/bin/env bash
# Levanta TODO en local: Supabase (Docker), el simulador de servicios externos y la app.
#   ./scripts/local.sh          → modo demo (Microsoft, Holded y Claude simulados)
#   REAL=1 ./scripts/local.sh   → usa tus credenciales reales de .env.local sin simulador
set -euo pipefail
cd "$(dirname "$0")/.."

command -v docker >/dev/null || { echo "Necesitas Docker (Docker Desktop) instalado y arrancado."; exit 1; }
[ -d node_modules ] || npm install

npx supabase start -x studio,realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor,postgres-meta
eval "$(npx supabase status -o env | sed 's/^/export SB_/')"

if [ ! -f .env.local ]; then
  VAPID=$(npx --yes web-push generate-vapid-keys --json)
  cat > .env.local <<ENV
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_TIMEZONE=Europe/Madrid
NEXT_PUBLIC_SUPABASE_URL=${SB_API_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${SB_ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SB_SERVICE_ROLE_KEY}
ENCRYPTION_KEY=$(openssl rand -base64 48)
CRON_SECRET=$(openssl rand -hex 32)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=$(node -pe "JSON.parse(process.argv[1]).publicKey" "$VAPID")
VAPID_PRIVATE_KEY=$(node -pe "JSON.parse(process.argv[1]).privateKey" "$VAPID")
VAPID_SUBJECT=mailto:yo@example.com
MS_CLIENT_ID=
MS_CLIENT_SECRET=
MS_TENANT_ID=common
ANTHROPIC_API_KEY=
ENV
  echo "Creado .env.local"
fi

if [ "${REAL:-0}" != "1" ]; then
  node scripts/mock-services.mjs &
  MOCK_PID=$!
  trap 'kill $MOCK_PID 2>/dev/null' EXIT
  export MS_CLIENT_ID=mock MS_CLIENT_SECRET=mock ANTHROPIC_API_KEY=mock
  export MS_LOGIN_BASE_URL=http://localhost:4010/ms MS_GRAPH_BASE_URL=http://localhost:4010/graph/v1.0
  export HOLDED_BASE_URL=http://localhost:4010/holded ANTHROPIC_BASE_URL=http://localhost:4010/anthropic
  echo "Modo demo: Microsoft, Holded y Claude están SIMULADOS (ICS de prueba: http://localhost:4010/ics/calendar.ics)."
fi

echo "App:    http://localhost:3000   (correo del enlace mágico: http://127.0.0.1:54324)"
npm run dev
