# Multi-stage build for the CaseLens gateway. Also builds and serves the web
# console (same origin — no CORS, WebSockets just work).
# Build context is the repo root (see render.yaml / docker-compose.yml).

FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
# Copy the whole workspace and install once (simple + reliable for a monorepo).
COPY . .
RUN pnpm install --frozen-lockfile=false \
 && pnpm --filter @caselens/shared build \
 && pnpm --filter @caselens/web build \
 && pnpm --filter @caselens/gateway build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    WEB_DIST=/app/apps/web/dist \
    PORT=4000
RUN groupadd --system app && useradd --system --gid app app
# Copy the built workspace. Preserving the tree keeps pnpm's relative symlinks
# (node_modules -> packages/shared) intact.
COPY --from=build /app ./
RUN chown -R app:app /app
USER app
EXPOSE 4000
# Compiled JS runs under plain node (no tsx needed at runtime).
CMD ["node", "apps/gateway/dist/index.js"]
