#!/bin/sh
# Entrypoint de los contenedores backend. Para los servicios con base propia
# aplica las migraciones pendientes (idempotente) antes de arrancar; el gateway
# no tiene `migrate/` y arranca directo.
#
# RUN_MIGRATIONS=false salta la migración (útil si se corre `migrate deploy`
# como paso aparte de la plataforma, ej. preDeployCommand en Render).
set -e

if [ -f /app/migrate/prisma/schema.prisma ] && [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[entrypoint] ${SERVICE}: prisma migrate deploy…"
  cd /app/migrate
  /app/node_modules/.bin/prisma migrate deploy
  cd /app
fi

echo "[entrypoint] ${SERVICE}: iniciando (node main.js)…"
exec node main.js
