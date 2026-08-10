#!/usr/bin/env bash
# docs/10-operating-manual-solo.md §6 — primer paso ante un incidente, antes del diagnóstico.
# Uso: ./infra/rollback.sh <tag-anterior>
set -euo pipefail

TAG="${1:?Uso: ./infra/rollback.sh <tag-anterior>}"

echo "Volviendo a la imagen ${TAG}..."
export IMAGE_TAG="${TAG}"
docker compose pull
docker compose up -d
echo "Listo. Verifica /api/health y /api/ready antes de dar por resuelto."
