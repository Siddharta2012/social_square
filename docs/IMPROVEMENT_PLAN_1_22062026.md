# Social Square — Improvement Plan #1 (2026-06-22)

> **Audience:** an autonomous coding agent (objective mode). Execute one objective
> at a time, each as an independently shippable PR, until the backlog is green.
> **Origin:** this plan is the actionable output of the 2026-06-22 "brutal" audit.
> It **supersedes and concretizes** `docs/IMPROVEMENT_PLAN.md` §O5 (economy audit)
> and adds the security/safety/scale/retention work the audit surfaced. Where the
> two plans overlap, **this one wins**.
> **Repo:** pnpm monorepo — `apps/client` (Phaser 3 + React HUD + Vite + Zustand),
> `apps/server` (Express + Socket.IO + ioredis + zod + JWT + pg), `packages/shared`.

---

## 0. How to work (objective-mode protocol)

For **every** objective `O*`:

1. **One objective = one branch = one PR.** Branch: `<type>/p1-<id>-<slug>`
   (e.g. `feat/p1-o1-postgres-accounts`). Never work on `main`.
2. **Read before writing.** Open the cited files and the code around them; match
   existing style (English comments, strict TS, 2-space).
3. **Stay in scope.** Do only the objective's *Tasks*. Unrelated problems go in
   the PR body under "Follow-ups".
4. **Definition of Done — all must pass before opening the PR:**
   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter shared build
   pnpm -r typecheck
   pnpm -r lint
   pnpm -r test
   pnpm build
   ```
   Run server tests with `REDIS_MOCK=true` (in-memory mock). Paste the output (or a
   faithful summary) into the PR. No success claims without running them.
5. **Tests ship with the change.** New logic → unit tests. Bug/security fix →
   a regression test that fails before the fix.
6. **Conventional Commits.** Footer: `Co-Authored-By: <agent> <noreply@…>`.
7. **Never commit** `dist/`, `*.log`, `.env`, `node_modules`.
8. **Acceptance is binding.** Done = every checkbox verifiably true.

**Execution order:** P0 → P1 → P2, in listed order. P0 objectives are data/money
integrity and must land first; several later objectives assume O1–O2 exist.

---

## Priority map

| Pri | Objectives | Theme |
|-----|-----------|-------|
| **P0** | O1, O2, O3, O4 | Durable accounts, atomic ledger wallet, kill write-on-read, server-authoritative pool |
| **P1** | O5, O6, O7, O8 | Endpoint/header hardening, auth hardening, moderation & safety, horizontal-scale readiness |
| **P2** | O9, O10, O11, O12, O13 | Cosmetic sink, progression, social graph, more rooms/games, UI monolith decomposition |

**Audit evidence (read these first):** `apps/server/src/services/UserService.ts`,
`apps/server/src/config/database.ts`, `apps/server/src/index.ts`,
`apps/server/src/api/routes/auth.ts`, `apps/server/src/socket/middleware/socketAuth.ts`,
`apps/server/src/socket/handlers/poolHandler.ts`, `apps/server/src/utils/rateLimit.ts`.

---

# P0 — Data & economy integrity

## O1 — Make Postgres the durable system of record for accounts
**Area:** persistence/data-loss · **Severity:** critical
**Why:** `UserService` stores users, `passwordHash`, `petals`, and stats **only in
Redis** (`apps/server/src/services/UserService.ts`); Postgres is connected solely
for a `select 1` health check (`apps/server/src/config/database.ts`). Redis is a
cache: under `maxmemory` eviction or a flush, **all accounts and wallets are lost**.
`persist()` does not protect against `allkeys-lru` eviction. This is the #1 risk.

**Tasks**
- Add a migration system (numbered SQL + a `pnpm --filter server migrate` runner,
  or `node-pg-migrate`). Convert `scripts/init.sql` into migration `0001` and add a
  migration for the real `users` table (id, username unique CI, provider,
  password_hash, google_sub unique, email, display_name, picture, avatar_config
  jsonb, position jsonb, unlocked_items jsonb, petals bigint, stats jsonb,
  created_at, updated_at).
- Rewrite `UserService` to read/write Postgres as the source of truth. Keep Redis
  **only** for ephemeral runtime state (presence, room/object state, cooldowns,
  rate limits) — never as the wallet store.
- Add a one-time **migration script** that imports existing Redis user blobs into
  Postgres (so current accounts/petals survive the cutover).
- `/api/ready` already checks the DB — keep it; now it's meaningful.

**Acceptance**
- [ ] Wiping Redis (`FLUSHALL` on a test instance) loses **no** account or petal data.
- [ ] `pnpm --filter server migrate` builds the schema from an empty DB reproducibly.
- [ ] Existing Redis users are importable via the documented one-shot script.
- [ ] No user/economy field is read from Redis anymore (grep `UserService` for `redis`).

## O2 — Atomic, ledger-backed wallet (no more lost/duplicated petals)
**Area:** economy correctness · **Severity:** critical · **Depends on:** O1
**Why:** `awardPetals`/`spendPetals` do non-atomic read-modify-write
(`UserService.ts` ~L229–275): `findById` → mutate → `saveUser`, with no
`WATCH/MULTI`/locking. Concurrent operations (the 32 ms petal auto-collect loop +
any purchase) interleave and clobber each other → petals lost or duplicated. It is
exploitable.

**Tasks**
- Model the wallet as an **append-only ledger** table (`petal_ledger`: id, user_id,
  delta, reason, ref_id, balance_after, created_at) plus a denormalized
  `users.petals` updated **atomically in the same SQL transaction**
  (`UPDATE … SET petals = petals + $delta WHERE id=$id AND petals + $delta >= 0
  RETURNING petals`). A spend that would go negative fails the row condition →
  return "insufficient" without mutating.
- Make every economy entry point (`awardPetals`, `spendPetals`, daily, pool/jukebox
  spend, item grant) go through this single transactional path with an idempotency
  key (`ref_id`) so retries can't double-apply.
- Add concurrency tests: N parallel awards + spends end at the arithmetically
  correct balance; a duplicated request with the same `ref_id` applies once.

**Acceptance**
- [ ] 100 concurrent ±petal operations end at the exact expected balance (test).
- [ ] Replaying an economy op with the same idempotency key does not double-apply.
- [ ] Balance can never go negative; ledger sum == `users.petals` (invariant test).

## O3 — Eliminate write-on-read amplification
**Area:** performance/correctness · **Depends on:** O1
**Why:** `readUser` performs a full `saveUser` (3–5 `SET`+`PERSIST`) on **every
read** (`UserService.ts` ~L287–293). Every `findById` rewrites the whole user 3×,
hammering the store and widening the O2 race window.

**Tasks**
- Reads must not write. Remove the implicit `saveUser` from the read path; apply
  defaults in memory only. Persist solely on explicit mutations.
- Audit hot paths (socket move/interact handlers) for redundant `findById` calls;
  cache the authenticated user per request/connection where safe.

**Acceptance**
- [ ] A profile read issues zero writes (verified via a spy/mock or query log).
- [ ] No behavior regression in auth/economy tests.

## O4 — Server-authoritative pool outcomes
**Area:** game integrity · **Why:** the client simulates physics and sends final
ball positions via `pool-sync`; the server derives `finished`/winner from the
client-supplied diff (`apps/server/src/socket/handlers/poolHandler.ts` +
`apps/client/src/ui/PoolOverlay.tsx`). A client can declare any result. Today pool
is a petal *sink* (not a faucet), so this is integrity/fairness — but it must be
fixed before any match reward, ranking, or wager is added.

**Tasks**
- Move the authoritative shot resolution server-side: given the validated shot
  (`angle/power/spin`) and the stored pre-shot ball state, run the **same
  deterministic physics** (extract the stepper into `packages/shared` so client and
  server share one implementation) and compute the resulting balls + outcome on the
  server. The client animates; the server decides.
- Reject `pool-sync` as the source of truth; at most accept it as a presentation
  hint reconciled against the server result. Validate it is the shooter's turn and
  bound potted-per-shot.
- Unit-test the shared stepper for determinism (same input → same output).

**Acceptance**
- [ ] A forged `pool-sync` ("all balls pocketed") does **not** win the game.
- [ ] Server and client converge on the same ball state for a given shot (test).
- [ ] Out-of-turn / malformed shots are rejected with a coded error + `requestId`.

---

# P1 — Security, safety, scale

## O5 — Lock down endpoints & add security headers
**Area:** security · **Why:** `/metrics` is public with no auth
(`apps/server/src/index.ts` ~L79), leaking operational data; there is no `helmet`
(no CSP/HSTS/X-Frame-Options) while the server also serves the SPA.

**Tasks**
- Protect `/metrics` (and any `/api/admin/*`) behind an admin token / allowlist;
  return 404 publicly. Keep dev affordances dev-only.
- Add `helmet` with a sensible CSP for the Phaser/React app and LiveKit origins;
  set HSTS in production. Add an explicit JSON body size limit.
- Re-verify CORS: production same-origin, dev `CLIENT_URL` only.

**Acceptance**
- [ ] `/metrics` returns 401/404 without an admin credential.
- [ ] Security headers present in prod responses (CSP, HSTS, X-Frame-Options).
- [ ] App still loads and voice still connects under the CSP (verified in-app).

## O6 — Harden authentication & sessions
**Area:** security · **Why:** `loginOrRegister` conflates login/registration
(username squatting), min password is **4 chars** (`auth.ts` ~L256); `logout` is a
no-op so JWTs can't be revoked (`auth.ts` ~L238); Google OAuth has no PKCE and the
`state` isn't bound to the browser session (`auth.ts` ~L287); legacy socket auth
lets anyone pick any username with `userId = socket.id`
(`socketAuth.ts` ~L35).

**Tasks**
- Split **register** vs **login**; reject duplicate-username registration with a
  clear error; raise the password policy (length + basic strength) and rate-limit
  per account, not just per IP.
- Introduce refresh tokens + short-lived access tokens, or a server-side session/
  token-version so `logout` and "log out everywhere" actually revoke. Persist
  revocation (DB/Redis) checked on socket connect and protected routes.
- OAuth: add PKCE and bind `state` to a signed, http-only cookie nonce; reject
  mismatches.
- Gate legacy socket auth strictly behind a non-production flag and document it;
  ensure it can never grant a persistent identity in prod.

**Acceptance**
- [ ] Registering an existing username fails; weak passwords are rejected.
- [ ] After logout, the old token is rejected by API and socket.
- [ ] OAuth callback with a mismatched/absent state cookie is rejected.
- [ ] Legacy username auth is impossible when `NODE_ENV=production`.

## O7 — Moderation & safety suite (pre-launch, non-optional)
**Area:** trust & safety · **Why:** it's a consumer voice + text product with
**no** report/block (only local mute), no server-side chat filtering, no age gate,
no audit. This is an existential/legal risk before real users share a voice room.

**Tasks**
- Persistent **report** and **block** (block hides chat + mutes voice + prevents
  room co-presence where feasible); store reports with context for review.
- Server-side chat moderation: profanity/abuse filter + rate-limit + max length
  (sanitize to prevent any HTML/script injection in the HUD).
- Room controls: mute/kick (host or trust-role), and a global ban list checked on
  connect. Append-only **audit log** of moderation actions.
- Age gate at signup + a minimal ToS/consent record.

**Acceptance**
- [ ] A blocked user's messages/voice never reach the blocker; persists across sessions.
- [ ] Disallowed chat content is filtered/rejected server-side; no raw HTML renders.
- [ ] Reports and moderation actions are persisted and queryable.

## O8 — Horizontal-scale readiness
**Area:** scalability · **Why:** there is no Socket.IO Redis adapter and rate
limiters are in-memory (`apps/server/src/utils/rateLimit.ts`), so the system is
single-instance: two nodes share neither sockets nor limits, and a restart drops
presence + rate-limit state. Hard ceiling for an "always-open tab" product.

**Tasks**
- Add `@socket.io/redis-adapter` (reuse the existing ioredis client) so rooms/
  broadcasts work across instances; verify interest broadcasting still holds.
- Move rate limiting to a shared Redis-backed limiter (atomic `INCR`+`EXPIRE` or a
  token-bucket Lua script) keyed consistently with today's buckets.
- Make presence/room cleanup robust to multi-instance and restarts (TTL + reconcile
  on (re)connect).

**Acceptance**
- [ ] Two server instances behind a load balancer share rooms, broadcasts, and limits.
- [ ] Killing one instance doesn't desync presence or reset another's rate limits.

---

# P2 — Retention features & code quality

## O9 — Cosmetic shop (the missing petal sink)
**Area:** product/economy · **Depends on:** O1–O2
**Why:** petals are earned (flowers + daily) but buy nothing permanent — the avatar
customizes for free. The currency has no meaningful sink, so it has no pull.

**Tasks**
- Define a catalog of unlockable cosmetics (avatar parts, emotes, titles, room
  decorations) with petal prices in `packages/shared`.
- Server-authoritative purchase flow (spend via the O2 ledger, idempotent), writing
  to `unlockedItems`; equip/unequip persisted on the profile.
- Client shop UI + "owned/equipped" states; gate avatar parts behind ownership.

**Acceptance**
- [ ] Buying a cosmetic atomically spends petals and unlocks it; double-click can't
      double-charge.
- [ ] Equipped cosmetics persist across sessions and render for remote players.

## O10 — Progression & return loop
**Area:** retention · **Why:** nothing rewards coming back beyond the chat itself.
**Tasks**
- XP/levels from activity, daily quests, and a presence **streak** with escalating
  rewards (server-authoritative, ledger-backed).
- Surface progress in the HUD; notify on level-up / streak milestones.

**Acceptance**
- [ ] Quests/streaks award via the ledger; can't be farmed past their cooldowns.
- [ ] Progress persists and is shown in the HUD.

## O11 — Social graph (friends, presence, whispers)
**Area:** product · **Why:** a *social* space where you can't refind a person.
**Tasks**
- Friends/follow with requests + accept; online presence for friends; "join friend".
- Private whispers/DMs (subject to O7 block rules).

**Acceptance**
- [ ] Add/accept a friend; see their online status; jump to their room.
- [ ] Whispers respect blocks and chat moderation.

## O12 — More social surfaces (private rooms / mini-games / events)
**Area:** product · **Why:** the architecture already supports multiple interactive
objects and rooms; expand the reasons to gather. *Scope per PR — pick one.*
**Tasks (choose one per objective slice)**
- **Private/instanced rooms** with invite codes (party with friends).
- **One new mini-game** reusing the pool/jukebox interaction pattern (darts, cards),
  with shared, server-authoritative rule logic.
- **Timed events + leaderboards** with limited-time cosmetics.

**Acceptance**
- [ ] The chosen surface works end-to-end, server-authoritative where money/score
      is involved, with tests for the shared logic.

## O13 — Decompose UI monoliths
**Area:** maintainability · **Why:** `apps/client/src/ui/HUD.tsx` (~1392 lines),
`apps/client/src/ui/PoolOverlay.tsx` (~891), `apps/client/src/world/SectorRenderer.ts`
(~750) concentrate too much, mirroring the now-fixed server monolith.
**Tasks**
- Split `HUD.tsx` into focused components/hooks (top bar, action bar, modals,
  per-feature panels). Same for `PoolOverlay` (view vs. render vs. input).
- Pure refactor; rely on tests + in-app verification for parity.

**Acceptance**
- [ ] No UI file exceeds ~500 lines; behavior unchanged; build + tests green.

---

## Appendix A — Global Definition of Done (every PR)
```bash
pnpm install --frozen-lockfile
pnpm --filter shared build
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm build
```
All six exit 0. New behavior tested; security/bug fixes ship a regression test that
failed before. Diff scoped to the objective. PR body lists what was verified.

## Appendix B — Invariants to preserve
- **Petal collection** is optimistic and reconciled by absolute totals; every
  server reply/error for `petal-collect` carries a `requestId`; pending collects
  self-heal via timeout and per-point retry cooldown. Don't regress this.
- **Pool rule logic** is pure and lives in `packages/shared`; after O4 the physics
  stepper is shared and the **server** is authoritative for outcomes.
- **Redis mock** (`REDIS_MOCK=true`) keeps the server bootable without real Redis
  for tests/local dev. After O1, Redis holds only ephemeral state — never the wallet.
- **Economy goes through one transactional, idempotent, ledgered path** (O2). No
  handler may mutate `petals` directly.
