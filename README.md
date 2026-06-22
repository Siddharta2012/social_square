# Social Square

[![CI](https://github.com/Siddharta2012/social_square/actions/workflows/ci.yml/badge.svg)](https://github.com/Siddharta2012/social_square/actions/workflows/ci.yml)

Social Square is a realtime social room prototype with an isometric Phaser world,
a React HUD, Socket.IO multiplayer, Redis-backed live state, wallet actions, voice
chat hooks, jukebox, waiter interactions, petals, seating, and pool.

## Stack

- `apps/client`: Vite, Phaser 3, React, Zustand, Socket.IO client.
- `apps/server`: Express, Socket.IO, Redis/ioredis, zod, JWT auth.
- `packages/shared`: shared event types, constants, and pure game logic.

## Quickstart

1. Install Node 20 and pnpm 11.8+.
2. Copy `env.example` to `.env` and set `JWT_SECRET`.
3. Start local services:

```bash
docker-compose up -d
```

4. Install dependencies:

```bash
pnpm install
```

5. Run migrations:

```bash
pnpm --filter server migrate
```

6. Start development:

```bash
pnpm dev
```

The client runs on `http://localhost:5173`; the server runs on
`http://localhost:3000`.

## Scripts

```bash
pnpm --filter shared build
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm build
```

## Deploy

Railway builds shared, client, and server, then serves the built client from the
Express server. Readiness is exposed at `/api/ready`; liveness is `/api/health`.

More detail: `docs/architecture/overview.md` and `docs/architecture/state.md`.
