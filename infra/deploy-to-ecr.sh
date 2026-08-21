#!/bin/bash
set -euo pipefail

# Script de despliegue: construye imágenes Docker y las empuja a ECR
# Uso: ./infra/deploy-to-ecr.sh [IMAGE_TAG] [ENTORNO]
# Ejemplo: ./infra/deploy-to-ecr.sh v1.0.0 dev

IMAGE_TAG="${1:-latest}"
ENTORNO="${2:-dev}"

# Obtener Account ID y región
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION="${AWS_REGION:-us-east-1}"
REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Despliegue a ECR"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "IMAGE_TAG:  $IMAGE_TAG"
echo "ENTORNO:    $ENTORNO"
echo "REGISTRY:   $REGISTRY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. Login a ECR
echo "📝 Autenticando en ECR..."
aws ecr get-login-password --region $REGION | \
  docker login --username AWS --password-stdin $REGISTRY

# La arquitectura del SERVIDOR, no la de quien construye.
#
# **La instancia es x86_64** (`compute.tf` pide una AMI `al2023-*-x86_64`). Sin esta bandera, un Mac
# con Apple Silicon construye imágenes arm64, las sube a ECR, y el servidor no puede correrlas: se
# descubre en el arranque, con el ambiente ya detenido. Fijarla cuesta unos minutos de emulación al
# construir y quita esa clase entera de sorpresa.
PLATAFORMA="${PLATAFORMA:-linux/amd64}"

# 2. Construir imagen API
echo ""
echo "🔨 Construyendo imagen API para ${PLATAFORMA}..."
docker build \
  --platform "$PLATAFORMA" \
  --tag cuatrosoles-${ENTORNO}-api:${IMAGE_TAG} \
  --tag $REGISTRY/cuatrosoles-${ENTORNO}-api:${IMAGE_TAG} \
  --tag $REGISTRY/cuatrosoles-${ENTORNO}-api:latest \
  --file apps/api/Dockerfile \
  .

# 3. Construir imagen Caddy (Web + Reverse Proxy)
echo ""
echo "🔨 Construyendo imagen Caddy para ${PLATAFORMA}..."
docker build \
  --platform "$PLATAFORMA" \
  --tag cuatrosoles-${ENTORNO}-caddy:${IMAGE_TAG} \
  --tag $REGISTRY/cuatrosoles-${ENTORNO}-caddy:${IMAGE_TAG} \
  --tag $REGISTRY/cuatrosoles-${ENTORNO}-caddy:latest \
  --file infra/caddy.Dockerfile \
  .

# 4. Empujar API a ECR
echo ""
echo "📤 Empujando API a ECR..."
docker push $REGISTRY/cuatrosoles-${ENTORNO}-api:${IMAGE_TAG}
docker push $REGISTRY/cuatrosoles-${ENTORNO}-api:latest

# 5. Empujar Caddy a ECR
echo ""
echo "📤 Empujando Caddy a ECR..."
docker push $REGISTRY/cuatrosoles-${ENTORNO}-caddy:${IMAGE_TAG}
docker push $REGISTRY/cuatrosoles-${ENTORNO}-caddy:latest

# 6. Listar imágenes en ECR
echo ""
echo "✅ Imágenes en ECR:"
aws ecr describe-images \
  --repository-name cuatrosoles-${ENTORNO}-api \
  --region $REGION \
  --query 'imageDetails[*].[imageTags,imageSizeInBytes,imagePushedAt]' \
  --output table

aws ecr describe-images \
  --repository-name cuatrosoles-${ENTORNO}-caddy \
  --region $REGION \
  --query 'imageDetails[*].[imageTags,imageSizeInBytes,imagePushedAt]' \
  --output table

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ Despliegue completado"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Próximo paso: Ejecutar en la instancia:"
echo ""
echo "  docker compose -f infra/docker-compose.prod.yml up -d"
echo ""
echo "Con variables de entorno:"
echo "  ECR_REGISTRY=$REGISTRY"
echo "  IMAGE_TAG=$IMAGE_TAG"
echo "  ENTORNO=$ENTORNO"
