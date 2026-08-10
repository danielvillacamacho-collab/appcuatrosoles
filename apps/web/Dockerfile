# docs/07-deployment-ec2.md. La SPA se compila a estáticos y los sirve Caddy directamente
# (ADR-003) — este contenedor sólo existe para producir /srv/web en el build de CI, no corre
# un proceso Node en producción.
FROM node:22-slim AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @polo/domain --filter @polo/contracts --filter @polo/ui --filter @polo/web build

FROM scratch AS export
COPY --from=build /repo/apps/web/dist /srv/web
