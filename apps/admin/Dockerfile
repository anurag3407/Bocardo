# syntax=docker/dockerfile:1
# Bocardo Admin - Next.js 14 (standalone output)
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/admin/package.json apps/admin/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile --filter @bocardo/admin...

FROM deps AS build
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
COPY packages packages
COPY apps/admin apps/admin
RUN pnpm --filter @bocardo/shared-types build || true \
 && pnpm --filter @bocardo/ui build || true \
 && pnpm --filter @bocardo/admin build

FROM node:20-alpine AS runtime
RUN addgroup -S bocardo && adduser -S bocardo -G bocardo
WORKDIR /app
ENV NODE_ENV=production PORT=3001
COPY --from=build /app/apps/admin/.next/standalone ./
COPY --from=build /app/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=build /app/apps/admin/public ./apps/admin/public
USER bocardo
EXPOSE 3001
CMD ["node", "apps/admin/server.js"]
