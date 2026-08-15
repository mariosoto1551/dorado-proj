#!/usr/bin/env bash
# Despliegue del servidor de casa, construyendo UN servicio a la vez.
#
# ─────────────────────────────────────────────────────────────────────────────
# POR QUÉ EXISTE ESTE SCRIPT Y NO UN `docker compose up -d --build`.
#
# El 2026-08-15 un `up -d --build` derecho tumbó el servidor: docker compose
# construye todos los servicios EN PARALELO, cada builder levanta su propio Nx
# con su daemon, y 13 de esos juntos se comieron la RAM de la máquina. El kernel
# mató el build (exit 137) y en la cascada se llevó puesto también lo que estaba
# sirviendo — la familia quedó sin sistema y sin SSH para entrar a arreglarlo.
#
# Uno por uno tarda más y termina. Es la diferencia entera.
#
# Los DATOS NO SE TOCAN: no hay `down -v` ni nada que roce los volúmenes
# (`pgdata`, `rabbitmqdata`, `backups`). Al final es un `up -d` que recrea los
# contenedores contra los mismos volúmenes de siempre.
# ─────────────────────────────────────────────────────────────────────────────
#
# Uso, DESDE EL SERVIDOR y desacoplado de la sesión SSH (si se corta la
# conexión a mitad, el build sigue):
#
#   cd ~/dorado-proj && git pull
#   setsid nohup ./scripts/deploy-casa.sh > /tmp/deploy.log 2>&1 &
#   tail -f /tmp/deploy.log
set -euo pipefail

CASA=(-f infra/docker/docker-compose.casa.yml --env-file infra/docker/.env.casa)

# Cinturón y tirantes: aunque abajo se construya de a uno, esto evita que un
# `docker compose` futuro de este script vuelva a abanicarse solo.
export COMPOSE_PARALLEL_LIMIT=1
export DOCKER_BUILDKIT=1

# Orden: primero los que más tardan (los frontends compilan Angular/Astro), para
# que un fallo aparezca temprano y no después de veinte minutos de backend.
SERVICIOS=(
  app-web
  admin-web
  public-site
  identity-service
  billing-service
  activity-service
  session-service
  scoring-service
  rewards-service
  notification-service
  audit-service
  ai-service
  gateway
)

echo "== memoria antes de empezar =="
free -h || true
echo

total=${#SERVICIOS[@]}
i=0

for servicio in "${SERVICIOS[@]}"; do
  i=$((i + 1))
  echo "== [$i/$total] construyendo $servicio =="
  docker compose "${CASA[@]}" build "$servicio"
  # Entre imagen e imagen: sin esto, la caché de páginas y los restos del
  # builder anterior se acumulan y la última imagen construye con menos
  # memoria libre que la primera.
  sync
  echo "   libre después de $servicio: $(free -m | awk '/^Mem:/ {print $7" MB"}')"
done

echo
echo "== levantando el stack (los volúmenes de datos quedan intactos) =="
docker compose "${CASA[@]}" up -d

echo
echo "== estado =="
docker compose "${CASA[@]}" ps --format '{{.Service}}\t{{.Status}}'

echo
echo "== esperando al gateway =="
for _ in $(seq 1 60); do
  if curl -sf -m 5 http://localhost:3000/api/health > /dev/null 2>&1; then
    echo "gateway OK"
    exit 0
  fi
  sleep 5
done

echo "el gateway no respondió en 5 minutos — revisar: docker compose ${CASA[*]} logs gateway"
exit 1
