#!/usr/bin/env bash
#
# Instala el despliegue automático en la instancia (`docs/07` §6c).
#
# Existe como script aparte —y no sólo dentro de `start-services.sh`— para que se pueda instalar en
# una instancia que ya está andando **sin volver a correr la puesta a punto entera**. Es idempotente:
# repetirlo no rompe nada.
set -euo pipefail

USUARIO="${USUARIO_DEL_SERVICIO:-ec2-user}"

cd /srv/cuatrosoles

cp /data/appcuatrosoles/infra/auto-desplegar.sh ./auto-desplegar.sh
cp /data/appcuatrosoles/infra/desplegar.sh ./desplegar.sh
cp /data/appcuatrosoles/infra/docker-compose.prod.yml ./docker-compose.yml
chmod +x ./auto-desplegar.sh ./desplegar.sh
chown "$USUARIO" ./auto-desplegar.sh ./desplegar.sh ./docker-compose.yml 2>/dev/null || true

# **El servicio corre como `$USUARIO`, así que el `docker login` tiene que ser de `$USUARIO`.**
#
# Es el error que este script existe para no dejar cometer: entrar a GHCR con `sudo` deja las
# credenciales en `/root/.docker/config.json`, el temporizador corre como otro usuario, y el primer
# despliegue automático falla con «unauthorized» a las cinco minutos, cuando ya no hay nadie
# mirando. Se comprueba acá, antes de instalar nada.
if ! sudo -u "$USUARIO" docker manifest inspect "$(grep -E '^REGISTRO=' .env | cut -d= -f2-)/cuatrosoles-${ENTORNO:-dev}-api:latest" >/dev/null 2>&1; then
  echo "❌ El usuario «$USUARIO» no puede bajar la imagen de GHCR."
  echo ""
  echo "   Entra al registro COMO ESE USUARIO, no con sudo:"
  echo ""
  echo "     sudo -u $USUARIO docker login ghcr.io -u <usuario-de-github>"
  echo ""
  echo "   Si entraste con sudo, las credenciales quedaron en /root/.docker/config.json y el"
  echo "   temporizador no las va a ver."
  exit 1
fi

sudo tee /etc/systemd/system/auto-despliegue.service > /dev/null <<UNIDAD
[Unit]
Description=Desplegar la última versión verde publicada
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
User=${USUARIO}
WorkingDirectory=/srv/cuatrosoles
EnvironmentFile=/srv/cuatrosoles/.env
ExecStart=/srv/cuatrosoles/auto-desplegar.sh
UNIDAD

sudo tee /etc/systemd/system/auto-despliegue.timer > /dev/null <<'TEMPORIZADOR'
[Unit]
Description=Buscar versiones nuevas cada cinco minutos

[Timer]
OnBootSec=3min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
TEMPORIZADOR

sudo systemctl daemon-reload
sudo systemctl enable --now auto-despliegue.timer

echo "✅ Despliegue automático instalado."
echo "   Ver qué hizo:  journalctl -u auto-despliegue.service -n 50"
echo "   Forzar ahora:  sudo systemctl start auto-despliegue.service"
echo "   Apagarlo:      AUTO_DESPLIEGUE=off en /srv/cuatrosoles/.env"
