#!/usr/bin/env bash
#
# Despliega en la instancia una versión ya publicada (`docs/07` §9).
#
# Se corre **en el servidor**, por Session Manager. No construye nada: las imágenes las publicó
# GitHub Actions, y aquí sólo se bajan y se reinicia. Esa separación es a propósito — construir en
# una `t3.small` con 2 GB compite con Postgres por la memoria, y un despliegue que tumba la base
# mientras construye es peor que no desplegar.
#
# Volver atrás es este mismo comando con el `IMAGE_TAG` anterior, y por eso no hay `rollback.sh`
# aparte para este camino: desplegar y revertir son la misma operación con distinto argumento.
set -euo pipefail

cd /srv/cuatrosoles

if [ -z "${IMAGE_TAG:-}" ]; then
  echo "❌ Falta IMAGE_TAG."
  echo "   Uso: IMAGE_TAG=<sha> ./desplegar.sh"
  echo "   El sha sale del resumen del workflow «Publicar imágenes» en GitHub."
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

# Compatibilidad con instancias configuradas antes del cambio a GHCR: el compose ahora lee
# `REGISTRO`, y las que todavía tengan `ECR_REGISTRY` siguen funcionando sin tocar el `.env`.
REGISTRO="${REGISTRO:-${ECR_REGISTRY:-}}"
export REGISTRO

if [ -z "$REGISTRO" ]; then
  echo "❌ Falta REGISTRO en /srv/cuatrosoles/.env"
  echo "   Para GHCR: REGISTRO=ghcr.io/<propietario-del-repo>"
  exit 1
fi

# La etiqueta que está corriendo ahora, para poder decirla si algo sale mal.
ANTERIOR="$(grep -E '^IMAGE_TAG=' .env | cut -d= -f2- || true)"
echo "Versión actual: ${ANTERIOR:-(sin registrar)}"
echo "Versión nueva:  ${IMAGE_TAG}"

echo ""
echo "⬇️  Bajando imágenes..."
IMAGE_TAG="$IMAGE_TAG" docker compose -f docker-compose.yml pull api caddy

# **Se escribe en `.env` después de bajar las imágenes, no antes.** Si el `pull` falla —red, token
# vencido, etiqueta que no existe— el archivo queda apuntando a la versión que sí está corriendo, y
# un reinicio del servidor no arranca con una etiqueta que nadie puede bajar.
if grep -qE '^IMAGE_TAG=' .env; then
  sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=${IMAGE_TAG}|" .env
else
  echo "IMAGE_TAG=${IMAGE_TAG}" >> .env
fi

echo ""
echo "🔄 Reiniciando..."
docker compose -f docker-compose.yml up -d

echo ""
echo "⏳ Esperando a que el API esté listo..."
LISTO=false
for _ in $(seq 1 30); do
  if curl -fsS http://localhost/api/health >/dev/null 2>&1; then
    LISTO=true
    break
  fi
  sleep 2
done

if [ "$LISTO" = true ]; then
  # **Las migraciones se aplican en CADA despliegue, no sólo al arrancar la instancia.**
  #
  # La primera versión de este script no las corría y lo decía en la documentación: «para un
  # despliegue con migración, usa `start-services.sh`». Eso es una trampa — el día que alguien
  # despliegue una versión con tabla nueva usando el comando de siempre, el código nueva pide algo
  # que la base no tiene, y el síntoma son errores 500 en producción sin ninguna pista.
  #
  # `migrate deploy` es idempotente: si no hay nada pendiente, no hace nada. Correrlo siempre cuesta
  # dos segundos y quita esa clase entera de sorpresa.
  #
  # Con el rol dueño (T-007): el rol de la aplicación no puede alterar tablas, que es justamente el
  # punto.
  echo ""
  echo "🗄️  Aplicando migraciones pendientes..."
  URL_DE_MIGRACIONES="${DATABASE_URL_ADMIN:-$DATABASE_URL}"

  if docker exec -e DATABASE_URL="$URL_DE_MIGRACIONES" cuatrosoles-api-1 \
      npx -y prisma@6 migrate deploy --schema=prisma/schema.prisma; then
    echo "✅ Migraciones al día"
  else
    echo "❌ Las migraciones fallaron. El código nuevo está corriendo contra un esquema viejo."
    echo "   Volver atrás YA: IMAGE_TAG=${ANTERIOR} ./desplegar.sh"
    exit 1
  fi

  echo ""
  echo "✅ Desplegado: ${IMAGE_TAG}"
  docker compose -f docker-compose.yml ps
  exit 0
fi

echo "❌ El API no respondió en 60 segundos."
echo "   Logs:     docker compose -f docker-compose.yml logs api | tail -50"
echo "   Volver a: IMAGE_TAG=${ANTERIOR} ./desplegar.sh"
exit 1
