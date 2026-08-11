#!/bin/sh
# Backup de las bases de Dorado. Un archivo .sql.gz por base, en un directorio
# con la fecha, y borrado de lo que pasó la retención.
#
# Por qué un dump POR BASE y no un `pg_dumpall`: cada servicio es dueño de la
# suya y los incidentes también son de a uno (una migración que salió mal en
# rewards no tiene por qué obligar a restaurar identity). Con un archivo por
# base, restaurar es cirugía; con un dumpall, es volver el reloj atrás en todo
# el sistema. El costo es que los roles no van en el dump — los crea
# init-databases.sh cuando el volumen está vacío, que es justo el caso de un
# desastre real.
#
# Uso:
#   backup-postgres.sh                 # una corrida y termina
#   backup-postgres.sh --loop          # se queda y corre una vez por día
#
# Variables (todas con default):
#   PGHOST/PGUSER/PGPASSWORD  conexión (las estándar de libpq)
#   BACKUP_DIR                dónde escribir            (default /backups)
#   BACKUP_RETENCION_DIAS     cuántos días conservar    (default 14)
#   BACKUP_HORA               hora del día en --loop    (default 03)
set -eu

BASES='identity_db billing_db activity_db session_db scoring_db rewards_db notification_db audit_db ai_db'
BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENCION="${BACKUP_RETENCION_DIAS:-14}"
HORA="${BACKUP_HORA:-03}"

log() {
  echo "[backup $(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*"
}

# Un backup que "anduvo" pero dejó un archivo vacío o cortado es peor que no
# tener backup: da confianza falsa hasta el día que hay que usarlo. Cada dump
# se verifica acá mismo — gzip -t prueba que el archivo está completo, y el
# marcador final que pg_dump escribe prueba que el volcado no se cortó a la
# mitad.
verificar() {
  archivo="$1"

  if ! gzip -t "$archivo" 2>/dev/null; then
    log "ERROR: $archivo está cortado o corrupto (gzip -t falló)"

    return 1
  fi

  if ! gzip -dc "$archivo" | tail -5 | grep -q 'PostgreSQL database dump complete'; then
    log "ERROR: $archivo no termina con el marcador de pg_dump (volcado incompleto)"

    return 1
  fi

  return 0
}

correr_backup() {
  destino="${BACKUP_DIR}/$(date -u '+%Y-%m-%d_%H%M')"
  fallidas=''

  mkdir -p "$destino"
  log "escribiendo en $destino"

  for base in $BASES; do
    archivo="${destino}/${base}.sql.gz"

    if pg_dump --no-owner --no-privileges "$base" 2>/dev/null | gzip > "$archivo" &&
      verificar "$archivo"; then
      log "  ok  ${base} ($(du -h "$archivo" | cut -f1))"
    else
      log "  FALLÓ ${base}"
      fallidas="${fallidas} ${base}"
      rm -f "$archivo"
    fi
  done

  if [ -n "$fallidas" ]; then
    # El directorio se marca en el nombre: un `ls` alcanza para ver que ese
    # backup no sirve entero, sin tener que leer logs de hace dos semanas.
    mv "$destino" "${destino}_INCOMPLETO"
    log "TERMINÓ CON FALLAS:${fallidas} — carpeta marcada como _INCOMPLETO"

    return 1
  fi

  log "backup completo de $(echo "$BASES" | wc -w) bases"

  return 0
}

# La retención solo borra backups COMPLETOS. Los `_INCOMPLETO` se quedan a
# propósito: son la evidencia de que algo viene fallando, y son justo lo que
# una limpieza automática haría desaparecer antes de que alguien lo note.
podar() {
  find "$BACKUP_DIR" -maxdepth 1 -type d -name '20*_*' ! -name '*_INCOMPLETO' \
    -mtime "+${RETENCION}" -print -exec rm -rf {} + 2>/dev/null |
    while read -r viejo; do
      log "podado (>${RETENCION} días): $viejo"
    done
}

una_vez() {
  correr_backup
  resultado=$?
  podar

  return $resultado
}

if [ "${1:-}" = '--loop' ]; then
  log "modo loop: una corrida por día a las ${HORA}:00 UTC, retención ${RETENCION} días"

  while true; do
    ahora_h=$(date -u '+%H')
    ahora_m=$(date -u '+%M')

    if [ "$ahora_h" = "$HORA" ]; then
      una_vez || log 'la corrida falló; se reintenta mañana'
      sleep 3660 # más de una hora: no repetir dentro de la misma ventana
    else
      # Dormir hasta el próximo cambio de hora, no un intervalo fijo: así el
      # backup no se corre lentamente hacia adelante en el día.
      sleep $(((60 - ${ahora_m#0}) * 60))
    fi
  done
fi

una_vez
