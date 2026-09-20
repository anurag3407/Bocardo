# syntax=docker/dockerfile:1
# Bocardo API - Fastify + tRPC + Socket.io + BullMQ
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

# ---- deps: install workspace deps with lockfile ----
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile --filter @bocardo/api...

# ---- build ----
FROM deps AS build
COPY packages packages
COPY apps/api apps/api
RUN pnpm --filter @bocardo/shared-types build || true \
 && pnpm --filter @bocardo/database build || true \
 && pnpm --filter @bocardo/api build

# ---- runtime ----
FROM node:20-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate \
 && addgroup -S bocardo && adduser -S bocardo -G bocardo
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/packages ./packages
USER bocardo
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "apps/api/dist/server.js"]
