#!/bin/bash
set -euo pipefail

# Respaldo diario de la base a S3 (`docs/07` §7).
#
# Es el **segundo** mecanismo de respaldo, independiente de los snapshots de EBS: un snapshot
# recupera el volumen entero tal como estaba, y un `pg_dump` recupera los datos aunque el volumen
# ya no exista o el servidor sea otro. Que sean dos cosas distintas es a propósito — la forma más
# común de quedarse sin respaldo es que el único que había dependiera de lo que se rompió.
#
# **No cifra a mano**: el bucket tiene cifrado del lado del servidor (AES256) y la subida va por
# HTTPS. Una clave más que administrar es una clave más que perder el día que haya que restaurar.

DESTINO="${BUCKET_DE_RESPALDOS:?falta BUCKET_DE_RESPALDOS}"
DIRECTORIO="${DIRECTORIO_DEL_DESPLIEGUE:-/srv/cuatrosoles}"
ENTORNO="${ENTORNO:-dev}"

# Las credenciales de la base salen del mismo `.env` que usa el compose: un segundo lugar donde
# escribirlas es un segundo lugar donde se desincronizan.
set -a
# shellcheck disable=SC1091
source "${DIRECTORIO}/.env"
set +a

MARCA="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
ARCHIVO="$(mktemp -t respaldo-XXXXXX.sql.gz)"
trap 'rm -f "${ARCHIVO}"' EXIT

echo "[respaldo] volcando ${POSTGRES_DB}…"

# `-T` porque no hay terminal en un servicio de sistema. `--clean --if-exists` para que el volcado
# se pueda restaurar sobre una base que ya tiene cosas, que es el caso real de una restauración.
docker compose -f "${DIRECTORIO}/docker-compose.yml" exec -T postgres \
  pg_dump --username "${POSTGRES_USER}" --dbname "${POSTGRES_DB}" --clean --if-exists \
  | gzip -9 > "${ARCHIVO}"

# **La comprobación que hace que esto sea un respaldo y no un archivo.** Un `pg_dump` que falla a
# mitad de camino deja un archivo corto y perfectamente subible: sin este control, el día de la
# restauración se descubre que hace meses se están guardando ceros.
TAMANO=$(stat -c%s "${ARCHIVO}" 2>/dev/null || stat -f%z "${ARCHIVO}")
MINIMO=$((20 * 1024))

if [ "${TAMANO}" -lt "${MINIMO}" ]; then
  echo "[respaldo] ABORTADO: el volcado pesa ${TAMANO} bytes, menos del mínimo razonable (${MINIMO})." >&2
  exit 1
fi

# Y que el gzip esté completo: `gzip -t` lee el archivo entero y verifica su suma de control.
gzip -t "${ARCHIVO}"

# Y que adentro haya un volcado de verdad, no un mensaje de error.
if ! gzip -dc "${ARCHIVO}" | head -5 | grep -q "PostgreSQL database dump"; then
  echo "[respaldo] ABORTADO: el archivo no parece un volcado de PostgreSQL." >&2
  exit 1
fi

RUTA="s3://${DESTINO}/${ENTORNO}/${MARCA}.sql.gz"
aws s3 cp "${ARCHIVO}" "${RUTA}"

echo "[respaldo] listo: ${RUTA} (${TAMANO} bytes)"
