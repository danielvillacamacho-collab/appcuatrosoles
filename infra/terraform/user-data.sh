#!/bin/bash
set -euo pipefail

# Preparación de la instancia. Corre una sola vez, al primer arranque.
#
# Deja la máquina lista para `docker compose up`, y nada más: no clona el repositorio ni arranca la
# aplicación. Eso lo hace el despliegue (GitHub Actions), que es quien sabe qué versión va.

dnf update -y
dnf install -y docker

# El plugin `compose` no viene en los repositorios de Amazon Linux 2023.
COMPOSE_VERSION=v2.29.7
mkdir -p /usr/local/lib/docker/cli-plugins
curl -sSL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-x86_64" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

systemctl enable --now docker
usermod -aG docker ec2-user

# ── El volumen de datos ───────────────────────────────────────────────────────
#
# **En instancias Nitro (t3 entre ellas) el volumen NO aparece como `/dev/sdf`**, aunque así se
# haya pedido: el kernel lo expone como `/dev/nvme1n1`, y el número depende del orden en que se
# conecten. Montar por nombre de dispositivo es la forma más común de que un reinicio deje la base
# de datos sin su disco.
#
# Por eso se busca por característica —el único disco sin sistema de archivos y sin montar— y se
# monta por UUID, que no cambia nunca.
DISCO=""
for candidato in /dev/nvme*n1; do
  [ -b "$candidato" ] || continue
  # El disco raíz tiene particiones; el volumen de datos, recién creado, no tiene ninguna.
  if [ -z "$(lsblk -no MOUNTPOINT "$candidato")" ] && [ "$(lsblk -no NAME "$candidato" | wc -l)" -eq 1 ]; then
    DISCO="$candidato"
    break
  fi
done

if [ -n "$DISCO" ]; then
  # `-t ext4` sólo si está vacío: si la instancia se recreó, el volumen ya trae los datos y
  # formatearlo los borraría. `blkid` devuelve vacío cuando no hay sistema de archivos.
  if [ -z "$(blkid -o value -s TYPE "$DISCO" || true)" ]; then
    mkfs -t ext4 "$DISCO"
  fi

  mkdir -p /var/lib/postgresql
  UUID=$(blkid -o value -s UUID "$DISCO")
  grep -q "$UUID" /etc/fstab || echo "UUID=$UUID /var/lib/postgresql ext4 defaults,nofail 0 2" >> /etc/fstab
  mount -a
fi

# Donde vive el despliegue: el `.env` con los secretos y el `docker-compose.yml`.
mkdir -p /srv/cuatrosoles
chown ec2-user:ec2-user /srv/cuatrosoles
chmod 750 /srv/cuatrosoles
