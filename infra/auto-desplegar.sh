#!/usr/bin/env bash
#
# Despliega solo la última versión verde (`docs/07` §6c).
#
# **La instancia va a buscar, en vez de que alguien le empuje.** Empujar desde GitHub Actions
# exigiría `ssm:SendCommand`, que exige el rol OIDC, que exige al equipo de infraestructura. Yendo a
# buscar, la instancia sólo necesita lo que ya tiene: entrar a GHCR y bajar una imagen. **Ningún
# permiso de AWS, ninguna credencial de larga vida, y nadie a quien esperar.**
#
# Lo que sigue es `latest`, y esa etiqueta la mueve `deploy.yml` **sólo cuando CI pasó**. Un commit
# con los tests en rojo no llega nunca al ambiente donde el club está probando.
#
# **Revierte solo.** Es la diferencia entre un despliegue desatendido y una ruleta: si el API no
# responde después de cambiar, esto vuelve a la versión anterior sin esperar a que alguien mire.
set -euo pipefail

cd /srv/cuatrosoles

set -a
# shellcheck disable=SC1091
source .env
set +a

REGISTRO="${REGISTRO:-${ECR_REGISTRY:-}}"
ENTORNO="${ENTORNO:-dev}"
IMAGEN_API="${REGISTRO}/cuatrosoles-${ENTORNO}-api"

if [ "${AUTO_DESPLIEGUE:-on}" != "on" ]; then
  echo "Despliegue automático apagado (AUTO_DESPLIEGUE en .env). No se hace nada."
  exit 0
fi

# Qué está corriendo ahora.
ACTUAL="$(grep -E '^IMAGE_TAG=' .env | cut -d= -f2- || true)"

# Qué hay publicado. Se baja `latest` y se le pregunta **a la imagen** de qué commit salió: el sello
# lo pone `deploy.yml`. Sin él habría que comparar digests, que no sirven para revertir porque no
# dicen a qué etiqueta volver.
docker pull --quiet "${IMAGEN_API}:latest" >/dev/null
NUEVO="$(docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "${IMAGEN_API}:latest" 2>/dev/null || true)"

if [ -z "$NUEVO" ]; then
  echo "⚠️  La imagen latest no trae el sello del commit. No se despliega a ciegas."
  exit 1
fi

if [ "$NUEVO" = "$ACTUAL" ]; then
  echo "Al día: ${ACTUAL}"
  exit 0
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Versión nueva detectada"
echo "  actual: ${ACTUAL:-(sin registrar)}"
echo "  nueva:  ${NUEVO}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if IMAGE_TAG="$NUEVO" ./desplegar.sh; then
  echo "✅ Desplegado solo: ${NUEVO}"
  exit 0
fi

echo ""
echo "❌ El despliegue de ${NUEVO} falló."

if [ -z "$ACTUAL" ]; then
  # Sin versión anterior registrada no hay a dónde volver. Se deja como está y se grita: es peor
  # revertir a una etiqueta inventada que quedarse quieto.
  echo "   No hay versión anterior registrada. Se requiere intervención."
  exit 1
fi

echo "↩️  Volviendo a ${ACTUAL}..."

if IMAGE_TAG="$ACTUAL" ./desplegar.sh; then
  echo "✅ Revertido a ${ACTUAL}. La versión ${NUEVO} NO quedó desplegada."
  # Se sale con error igualmente: el ambiente está sano, pero alguien tiene que enterarse de que una
  # versión no pudo desplegarse. Un fallo silencioso que se arregla solo es un fallo que se repite.
  exit 1
fi

echo "🚨 La reversión también falló. El ambiente necesita intervención manual."
exit 2
