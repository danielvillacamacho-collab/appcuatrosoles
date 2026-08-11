# Caddy con el módulo de Route 53, y la aplicación web adentro.
#
# **La imagen oficial de Caddy no sirve tal cual**: no trae el módulo de DNS de Route 53, y sin él
# no se puede emitir el certificado comodín que exige el subdominio por club (`ADR-013`). Hay que
# compilarlo con `xcaddy`.
#
# La SPA va **dentro de la misma imagen** y no en un volumen del servidor. Así el frontend es un
# artefacto único y con versión: desplegar es cambiar una etiqueta, y volver atrás es cambiarla de
# vuelta. Con un volumen, el HTML y el JavaScript pueden quedar de versiones distintas a mitad de
# una copia, y eso se ve como una pantalla en blanco que nadie sabe explicar.

FROM node:22-slim AS web
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @polo/domain --filter @polo/contracts --filter @polo/ui --filter @polo/web build

FROM caddy:2-builder AS builder
RUN xcaddy build --with github.com/caddy-dns/route53

FROM caddy:2
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
COPY --from=web /repo/apps/web/dist /srv/web
COPY infra/Caddyfile /etc/caddy/Caddyfile
