#!/bin/bash
set -euo pipefail

# Script para arrancar servicios en la instancia EC2
# Descarga imágenes de ECR y ejecuta docker compose prod
#
# Uso: ./infra/start-services.sh [IMAGE_TAG] [ENTORNO]
# Ejemplo: ./infra/start-services.sh v1.0.0 dev
#
# Nota: Este script debe correr en la instancia EC2, no en tu máquina local

IMAGE_TAG="${1:-latest}"
ENTORNO="${2:-dev}"

# Obtener Account ID y región
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION="${AWS_REGION:-us-east-1}"
REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Iniciando servicios en EC2"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "IMAGE_TAG:  $IMAGE_TAG"
echo "ENTORNO:    $ENTORNO"
echo "REGISTRY:   $REGISTRY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. Cambiar a directorio de aplicación
cd /srv/cuatrosoles || mkdir -p /srv/cuatrosoles && cd /srv/cuatrosoles

# 2. Crear .env si no existe (necesario para docker compose)
if [ ! -f .env ]; then
  echo "⚠️  Archivo .env no encontrado"
  echo "Por favor, crear .env con las variables necesarias:"
  echo "  POSTGRES_USER=polo"
  echo "  POSTGRES_PASSWORD=tu_password_seguro"
  echo "  POSTGRES_DB=polo_dev"
  echo "  BASE_DOMAIN=dev.cuatrosoles.co"
  echo "  AWS_REGION=us-east-1"
  exit 1
fi

# 3. Copiar docker-compose.prod.yml desde el repo (si está clonado)
if [ -f /data/appcuatrosoles/infra/docker-compose.prod.yml ]; then
  echo "📋 Copiando docker-compose.prod.yml..."
  cp /data/appcuatrosoles/infra/docker-compose.prod.yml ./docker-compose.yml
else
  echo "⚠️  docker-compose.yml no encontrado"
  echo "Asegúrate de que /data/appcuatrosoles está clonado"
  exit 1
fi

# 4. Detener servicios anteriores (si existen)
echo ""
echo "🛑 Deteniendo servicios anteriores..."
docker compose down 2>/dev/null || true

# 5. Limpiar imágenes viejas
echo ""
echo "🧹 Limpiando imágenes viejas..."
docker image prune -f 2>/dev/null || true

# 6. Descargar y arrancar servicios
echo ""
echo "📥 Descargando imágenes de ECR e iniciando servicios..."
ECR_REGISTRY=$REGISTRY \
IMAGE_TAG=$IMAGE_TAG \
ENTORNO=$ENTORNO \
docker compose up -d

# 6.5. Aplicar migraciones (después de que servicios estén listos)
echo ""
echo "⏳ Esperando a que API esté listo..."
RETRY_COUNT=0
MAX_RETRIES=30
until docker exec cuatrosoles-api-1 pnpm db:migrate:deploy 2>/dev/null || [ $RETRY_COUNT -eq $MAX_RETRIES ]; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  echo "  Intento $RETRY_COUNT/$MAX_RETRIES..."
  sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
  echo "⚠️  No se pudieron aplicar las migraciones. Revisar logs con: docker compose logs api"
else
  echo "✅ Migraciones aplicadas"
fi

# 7. Mostrar estado
echo ""
echo "📊 Estado de servicios:"
docker compose ps

# 8. Mostrar logs
echo ""
echo "📝 Logs (últimas 20 líneas):"
docker compose logs --tail 20

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ Servicios iniciados"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "URLs:"
echo "  API:    https://dev.cuatrosoles.co/api"
echo "  Web:    https://dev.cuatrosoles.co"
echo ""
echo "Monitorear logs:"
echo "  docker compose logs -f"
echo ""
echo "Detener servicios:"
echo "  docker compose down"
echo ""
echo "Ver estado:"
echo "  docker compose ps"
