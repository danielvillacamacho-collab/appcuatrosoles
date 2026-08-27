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

# El registro de imágenes.
#
# **Si `.env` trae `REGISTRO`, ése manda** — es el camino de GHCR, y entonces esto no llama a AWS
# para nada. Si no lo trae, se deriva ECR como antes, para que una instancia configurada antes del
# cambio siga arrancando sin que nadie le toque el `.env`.
REGISTRO_DEL_ENV=""
if [ -f /srv/cuatrosoles/.env ]; then
  REGISTRO_DEL_ENV="$(grep -E '^REGISTRO=' /srv/cuatrosoles/.env | cut -d= -f2- || true)"
fi

if [ -n "$REGISTRO_DEL_ENV" ]; then
  REGISTRY="$REGISTRO_DEL_ENV"
else
  ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
  REGION="${AWS_REGION:-us-east-1}"
  REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
fi

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

# 3a. El script de despliegue, para poder desplegar sin volver a correr todo esto.
#
# `start-services.sh` es la puesta a punto completa de la instancia; desplegar una versión nueva no
# necesita nada de eso, y correrlo entero por un cambio de código es arriesgar tocar cosas que no
# hacía falta tocar. `desplegar.sh` sólo baja imágenes y reinicia.
if [ -f /data/appcuatrosoles/infra/desplegar.sh ]; then
  echo "📋 Copiando desplegar.sh..."
  cp /data/appcuatrosoles/infra/desplegar.sh ./desplegar.sh
  chmod +x ./desplegar.sh
fi

# 3b. Respaldo diario de la base: script y temporizador
#
# **Va acá y no sólo en `user-data.sh`.** Ese archivo corre una única vez, en el primer arranque de
# la instancia: una máquina que ya estaba andando cuando se agregó el respaldo no lo tendría nunca,
# y nadie se enteraría hasta el día que hiciera falta restaurar. Puesto acá, cada despliegue lo deja
# instalado y al día — es idempotente, así que repetirlo no cuesta nada.
if [ -f /data/appcuatrosoles/infra/backup-db.sh ]; then
  echo ""
  echo "💾 Instalando el respaldo diario..."
  cp /data/appcuatrosoles/infra/backup-db.sh ./backup-db.sh
  chmod +x ./backup-db.sh

  sudo tee /etc/systemd/system/respaldo-db.service > /dev/null <<'UNIDAD'
[Unit]
Description=Respaldo de la base de datos a S3
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
User=ec2-user
WorkingDirectory=/srv/cuatrosoles
EnvironmentFile=/srv/cuatrosoles/.env
ExecStart=/srv/cuatrosoles/backup-db.sh
UNIDAD

  sudo tee /etc/systemd/system/respaldo-db.timer > /dev/null <<'TEMPORIZADOR'
[Unit]
Description=Respaldo diario de la base de datos

[Timer]
OnCalendar=*-*-* 08:20:00
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
TEMPORIZADOR

  sudo systemctl daemon-reload
  sudo systemctl enable --now respaldo-db.timer

  # Un aviso y no un fallo: que falte el nombre del bucket no puede impedir un despliegue. Pero
  # tiene que verse, porque sin esa variable el respaldo se ejecuta y termina en error todos los
  # días sin que nadie lo mire.
  if ! grep -q "^BUCKET_DE_RESPALDOS=." .env; then
    echo ""
    echo "⚠️  FALTA BUCKET_DE_RESPALDOS en /srv/cuatrosoles/.env"
    echo "    El respaldo diario va a fallar hasta que se agregue."
    echo "    El valor sale de: terraform output bucket_de_respaldos"
  fi
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
echo "📥 Descargando imágenes del registro e iniciando servicios..."
REGISTRO=$REGISTRY \
IMAGE_TAG=$IMAGE_TAG \
ENTORNO=$ENTORNO \
docker compose up -d

# 6.5. Aplicar migraciones (después de que servicios estén listos)
echo ""
echo "⏳ Esperando a que API esté listo..."
RETRY_COUNT=0
MAX_RETRIES=30
SUCCESS=false

# **Las migraciones corren con el DUEÑO de las tablas, no con el rol de la aplicación** (T-007).
#
# El rol con el que se conecta el API no puede crear ni alterar tablas — ése es justamente el
# punto—, así que si se usara el mismo, `migrate deploy` fallaría con «permission denied».
#
# Con el valor por defecto puesto en `DATABASE_URL`, esto sigue funcionando igual en una instancia
# que todavía no hizo el cambio: nada se rompe por desplegar antes de configurar el rol.
set -a
# shellcheck disable=SC1091
source .env
set +a
URL_DE_MIGRACIONES="${DATABASE_URL_ADMIN:-$DATABASE_URL}"

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if docker exec -e DATABASE_URL="$URL_DE_MIGRACIONES" cuatrosoles-api-1 npx -y prisma@6 migrate deploy --schema=prisma/schema.prisma 2>/dev/null; then
    SUCCESS=true
    echo "✅ Migraciones aplicadas"
    break
  fi
  RETRY_COUNT=$((RETRY_COUNT + 1))
  echo "  Intento $RETRY_COUNT/$MAX_RETRIES..."
  sleep 2
done

if [ "$SUCCESS" = false ]; then
  echo "⚠️  No se pudieron aplicar las migraciones después de $MAX_RETRIES intentos"
  echo "Revisar logs: docker compose logs api"
fi

# 6.6. La contraseña del rol de aplicación (T-007)
#
# La migración creó `polo_app` **sin contraseña y sin LOGIN**, porque una contraseña dentro de una
# migración es una contraseña dentro del repositorio. Se le pone acá, en cada despliegue: es
# idempotente y deja la instancia consistente con el `.env` aunque alguien haya rotado la clave.
if [ -n "${APP_DB_PASSWORD:-}" ] && [ "$SUCCESS" = true ]; then
  echo ""
  echo "🔐 Configurando el rol de aplicación…"
  if docker compose exec -T postgres psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
      -c "ALTER ROLE polo_app WITH LOGIN PASSWORD '${APP_DB_PASSWORD}'" > /dev/null; then
    echo "✅ Rol polo_app listo"
  else
    echo "⚠️  No se pudo configurar polo_app. El API seguirá conectándose con el rol que tenga en DATABASE_URL."
  fi
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
