# Pre-Deploy Checklist

## Build And Tests

- Run `pnpm --filter shared build`.
- Run `pnpm --filter server test`.
- Run `pnpm --filter server typecheck`.
- Run `pnpm --filter client test`.
- Run `pnpm --filter client typecheck`.
- Run `pnpm build`.

## Smoke Test

- Start the production-like server.
- Run `SMOKE_SERVER_URL=https://server-production-6a9f.up.railway.app pnpm smoke:dev` with `SMOKE_AUTH_TOKEN` when password login is disabled.
- Verify the smoke covers: dev/login token, bar join, location move, petal collection, jukebox paid start.

## Railway Variables

- `NODE_ENV=production`.
- `JWT_SECRET` set to a long random value.
- `DATABASE_URL` configured; Railway runs `node scripts/migrate.mjs` before server start.
- `REDIS_URL` configured, or `REDIS_MOCK=true` only for temporary test deployments.
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` configured.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` configured.
- `CLIENT_URL` points to the public app origin.

## OAuth Redirects

- Google Authorized redirect URI matches `GOOGLE_REDIRECT_URI`.
- The Railway public URL has no trailing mismatch between Google Console and env.
- `/api/auth/config` returns `googleEnabled: true`.

## Health And Debug

- `/api/health` returns `status: ok` and `checks.redis: true`.
- `/api/admin/debug` is reachable only outside production.
- Logs show structured `auth.*`, `socket.*`, and `economy.*` events.
