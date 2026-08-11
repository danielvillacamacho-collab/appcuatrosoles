# Imagen de producción del API (`docs/07` §1).
#
# **`pnpm deploy` y no `COPY node_modules`**, que es como estaba y no arrancaba: pnpm no instala
# copias, instala **enlaces simbólicos** a un almacén en la raíz del monorepo. Copiar
# `apps/api/node_modules` a otra imagen se lleva los enlaces y deja atrás el almacén al que apuntan,
# así que la imagen se construye sin un error y el proceso muere al primer `import` con
# «Cannot find package '@polo/domain'». `pnpm deploy` resuelve todo eso en un árbol autocontenido.

FROM node:22-slim AS build
WORKDIR /repo
RUN corepack enable

# OpenSSL **también aquí**, no sólo en la imagen final: `prisma generate` elige el motor de consulta
# según la versión de OpenSSL que detecta, y sin ella supone 1.1.x. La imagen se construye sin un
# error visible y al arrancar falla con «could not locate the Query Engine for runtime
# linux-...-openssl-3.0.x», que no menciona en ningún lado que el problema fue la etapa de build.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @polo/domain --filter @polo/contracts --filter @polo/api build

# `--prod` deja fuera las dependencias de desarrollo.
RUN pnpm --filter @polo/api --prod deploy /salida

# El cliente de Prisma es código generado y vive dentro de `node_modules`: `pnpm deploy` copia
# desde el almacén, donde no está lo que se generó después de instalar. Se vuelve a generar sobre
# el árbol ya armado.
RUN cd /salida && ./node_modules/.bin/prisma generate --schema=prisma/schema.prisma || \
    npx --yes prisma@6 generate --schema=/salida/prisma/schema.prisma

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Prisma necesita OpenSSL para hablar con PostgreSQL. `node:22-slim` no lo trae, y sin él el
# arranque falla con un error sobre la versión de libssl que no dice qué instalar.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /salida ./

# No corre como root: si algo se escapa del proceso, se escapa sin privilegios. `node` es un
# usuario que la imagen oficial ya trae.
USER node

EXPOSE 3000
CMD ["node", "dist/main.js"]
