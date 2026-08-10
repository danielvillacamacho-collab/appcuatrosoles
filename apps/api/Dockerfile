# docs/07-deployment-ec2.md. Build multi-stage: instala en el monorepo, corre sólo apps/api.
FROM node:22-slim AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @polo/domain --filter @polo/contracts --filter @polo/api build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/node_modules ./node_modules
COPY --from=build /repo/apps/api/prisma ./prisma
COPY --from=build /repo/node_modules ./../node_modules
EXPOSE 3000
CMD ["node", "dist/main.js"]
