#!/bin/sh
# Restaura las bases desde un backup de `backup-postgres.sh`.
#
# Existe por una razón concreta: un backup que nunca se restauró no es un
# backup, es un archivo. Este script es la mitad que se prueba.
#
# Uso:
#   restore-postgres.sh /backups/2026-08-10_0300              # todas las bases
#   restore-postgres.sh /backups/2026-08-10_0300 scoring_db   # una sola
#
# DESTRUCTIVO: la base destino se borra y se vuelve a crear antes de cargar el
# dump. Pide confirmación salvo que se pase RESTORE_SI=1 (para automatizar la
# prueba de restore, que es el único caso donde no hay un humano mirando).
set -eu

ORIGEN="${1:-}"
SOLO_BASE="${2:-}"

if [ -z "$ORIGEN" ]; then
  echo "Uso: $0 <directorio-de-backup> [base]" >&2
  exit 64
fi

if [ ! -d "$ORIGEN" ]; then
  echo "No existe el directorio: $ORIGEN" >&2
  exit 66
fi

log() {
  echo "[restore $(date -u '+%H:%M:%S')] $*"
}

archivos=$(find "$ORIGEN" -maxdepth 1 -name '*.sql.gz' | sort)

if [ -n "$SOLO_BASE" ]; then
  archivos=$(echo "$archivos" | grep "/${SOLO_BASE}.sql.gz$" || true)

  if [ -z "$archivos" ]; then
    echo "No hay dump de '${SOLO_BASE}' en ${ORIGEN}" >&2
    exit 66
  fi
fi

echo 'Se van a BORRAR y recrear estas bases:'
for a in $archivos; do
  echo "  - $(basename "$a" .sql.gz)"
done

if [ "${RESTORE_SI:-}" != '1' ]; then
  printf 'Escribí "restaurar" para continuar: '
  read -r respuesta

  if [ "$respuesta" != 'restaurar' ]; then
    echo 'Cancelado.'
    exit 1
  fi
fi

for archivo in $archivos; do
  base=$(basename "$archivo" .sql.gz)

  log "restaurando ${base}…"
  # DROP + CREATE en vez de cargar encima: un dump de pg_dump no borra lo que
  # ya está, así que cargarlo sobre una base con datos deja una mezcla de dos
  # momentos en el tiempo — que en un ledger es exactamente el peor resultado
  # posible. `psql -d postgres` porque no se puede dropear la base conectada.
  psql -d postgres -v ON_ERROR_STOP=1 -q -c "DROP DATABASE IF EXISTS \"${base}\" WITH (FORCE);"
  psql -d postgres -v ON_ERROR_STOP=1 -q -c "CREATE DATABASE \"${base}\";"
  gzip -dc "$archivo" | psql -d "$base" -v ON_ERROR_STOP=1 -q
  log "  ${base} listo"
done

log 'restore terminado'
