# syntax=docker/dockerfile:1
# Deterministic build for the pnpm monorepo. Railway's auto-builder (Railpack)
# kept falling back to `npm install`, which cannot resolve `workspace:*` deps.
FROM node:22-slim

# Use the exact pnpm version pinned in package.json, via corepack.
RUN corepack enable && corepack prepare pnpm@11.8.0 --activate

WORKDIR /app

# Copy the whole workspace (node_modules excluded via .dockerignore).
COPY . .

# Install all deps (dev deps are needed for tsc + vite during the build).
RUN pnpm install --frozen-lockfile

# Build order: shared -> client -> server. The server serves apps/client/dist.
RUN pnpm --filter shared build \
 && pnpm --filter client build \
 && pnpm --filter server build

ENV NODE_ENV=production

# Run DB migrations at boot, then start the server. Railway injects PORT/DATABASE_URL.
CMD ["sh", "-c", "node scripts/migrate.mjs && node apps/server/dist/index.js"]
