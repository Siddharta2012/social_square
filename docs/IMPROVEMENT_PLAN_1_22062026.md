# Social Square — Improvement Plan #1 (2026-06-22)

> **Audience:** an autonomous coding agent (objective mode). Execute one objective
> at a time, each as an independently shippable PR, until the backlog is green.
> **Origin:** this plan is the actionable output of the 2026-06-22 "brutal" audit.
> It **supersedes and concretizes** `docs/IMPROVEMENT_PLAN.md` §O5 (economy audit)
> and adds the security/safety/scale/retention work the audit surfaced. Where the
> two plans overlap, **this one wins**.
> **Repo:** pnpm monorepo — `apps/client` (Phaser 3 + React HUD + Vite + Zustand),
> `apps/server` (Express + Socket.IO + ioredis + zod + JWT + pg), `packages/shared`.

> **🔄 Progress update — 2026-06-22 (post-Codex pass).** Most of Phase 1 has been
> implemented (commits `bdc57cb` → `8b3094a`). Each objective below now carries a
> **Status** with evidence. **Phase 2** (O14–O21) is the new backlog: finish the
> partials and push retention/quality further. Legend: ✅ Done · 🟡 Partial · 🔴 Open.

---

## Progress snapshot

| # | Objective | Status | Evidence |
|---|-----------|--------|----------|
| O1 | Durable Postgres accounts | ✅ | `config/database.ts` (`query`/`withTransaction`), `UserService` SQL, `docs/security/economy.md` |
| O2 | Atomic ledger wallet | ✅ | `petal_ledger`, `SELECT … FOR UPDATE`, `ref_id` idempotency, balance repair |
| O3 | Kill write-on-read | ✅ | reads are pure `SELECT`s; Redis no longer stores accounts |
| O4 | Server-authoritative pool | 🟡 | `poolHandler.validatePoolSyncHint` + `poolAuthority.test.ts`; **residual client trust remains** → O14 |
| O5 | Lock endpoints + headers | ✅ | `securityHeaders`, `requireAdmin` on `/metrics`+admin, `express.json({limit:'64kb'})`, `utils/httpSecurity.ts` |
| O6 | Auth hardening | ✅ | `/register` vs `/login`, password ≥ 8, OAuth PKCE + state-cookie nonce, `auth_sessions` + `token_version` revocation |
| O7 | Moderation & safety | 🟡 | `ModerationService` (block/report/audit + `moderateChatText`); **no age gate / room mute-kick / ban-on-connect** → O15 |
| O8 | Horizontal-scale readiness | ✅ | `socketServer` `@socket.io/redis-adapter`, `rateLimit` via Redis `INCR`/`PEXPIRE` |
| O9 | Cosmetic shop | 🟡 | `routes/shop.ts` + service, `api/shop.ts`, `HudShopModal`; **verify ledger idempotency + equip rules** → O19 |
| O10 | Progression & return loop | 🔴 | only `claimDailyPresence` exists; no XP/quests/streaks → O16 |
| O11 | Social graph | 🟡 | `SocialService` (friends), `routes/social.ts`, `HudFriendsModal`; **no whispers/DM** → O20 |
| O12 | More social surfaces | 🟡 | private rooms done (`PrivateRoomService`, `routes/private-rooms`); **no new game / events** → O21 |
| O13 | Decompose UI monoliths | ✅ | `ui/hud/*`, `PoolOverlayView` + `poolCanvasRenderer` |

**Also landed from `docs/IMPROVEMENT_PLAN.md` (Phase 0):** CI (`.github/workflows/ci.yml`),
ESLint flat config (`eslint.config.mjs`) + Prettier + per-package `lint`/`typecheck`/`test`,
env validation (`config/env.ts`), i18n seam (`client/src/i18n`), reconnect resync
(`bar/roomStateReconciler.ts`), shared `vitest`, socket payload schemas (`socketSchemas.ts`),
single bcrypt impl (`bcryptjs`). 

---

## 0. How to work (objective-mode protocol)

For **every** objective `O*`:

1. **One objective = one branch = one PR.** Branch: `<type>/p2-<id>-<slug>`
   (e.g. `feat/p2-o16-progression`). Never work on `main`.
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
   Run server tests with `REDIS_MOCK=true`; DB-backed tests need a Postgres (see O17).
   Paste the output (or a faithful summary) into the PR. No success claims without
   running them.
5. **Tests ship with the change.** New logic → unit tests. Bug/security fix →
   a regression test that fails before the fix.
6. **Conventional Commits.** Footer: `Co-Authored-By: <agent> <noreply@…>`.
7. **Never commit** `dist/`, `*.log`, `.env`, `node_modules`.
8. **Acceptance is binding.** Done = every checkbox verifiably true.

**Execution order for Phase 2:** P0 (O14, O17) → P1 (O15, O18, O19) → P2 (O16, O20, O21).
O17 (DB-backed CI) should land early so every later DB change is actually tested.

---

# Phase 1 (status-annotated)

> These were the original audit objectives. Done/Partial markers reflect the
> 2026-06-22 Codex pass; partials are continued in Phase 2.

## O1 — Durable Postgres system of record · ✅ Done
Accounts/wallet now persist in Postgres (`config/database.ts`, `UserService` SQL).
Redis holds only ephemeral state. **Residual:** confirm the one-shot
`pnpm --filter server import:redis-users` cutover script is documented and tested
(rolled into O17).

## O2 — Atomic, ledger-backed wallet · ✅ Done
`petal_ledger` + `SELECT … FOR UPDATE` in `withTransaction`, idempotency via
`ref_id`, balance repaired from ledger. **Residual:** invariant monitoring (O19).

## O3 — Eliminate write-on-read amplification · ✅ Done
Reads are pure `SELECT`s; the Redis write-on-read pattern is gone.

## O4 — Server-authoritative pool outcomes · 🟡 Partial → see O14
`validatePoolSyncHint` rejects forged syncs (`poolAuthority.test.ts`) and bounds
implausible pots, but per `docs/security/economy.md` the client still reports final
ball positions + scratch. Full authority (server runs the physics) is **O14**.

## O5 — Lock down endpoints & headers · ✅ Done
`securityHeaders` middleware, `requireAdmin` on `/metrics` and `/api/admin/*`, JSON
body limit. **Residual:** verify the CSP allows LiveKit/media in production (O18).

## O6 — Harden authentication & sessions · ✅ Done
Register/login split, password ≥ 8, OAuth PKCE + signed state-cookie nonce,
`auth_sessions` + `token_version` so logout/revoke is real.

## O7 — Moderation & safety suite · 🟡 Partial → see O15
Block/unblock, reports, audit log, and `moderateChatText` filter exist. Missing:
age gate + ToS consent, room mute/kick, global ban enforced on connect, and wiring
the filter into **every** chat path. Continued in **O15**.

## O8 — Horizontal-scale readiness · ✅ Done
Socket.IO Redis adapter + Redis-backed rate limiter.

## O9 — Cosmetic shop · 🟡 Partial → see O19
Shop route/service/UI exist. Verify purchases go through the O2 ledger with
idempotency and that equip/ownership is enforced server-side.

## O10 — Progression & return loop · 🔴 Open → see O16
Only daily presence exists.

## O11 — Social graph · 🟡 Partial → see O20
Friends + presence exist; whispers/DMs do not.

## O12 — More social surfaces · 🟡 Partial → see O21
Private rooms done; a new mini-game and events/leaderboards do not exist.

## O13 — Decompose UI monoliths · ✅ Done
HUD split into `ui/hud/*`; pool split into view + canvas renderer.

---

# Phase 2 — Further objectives (new)

## O14 — Finish pool authority: server-side deterministic physics
**Pri:** P0 · **Area:** game integrity · **Continues:** O4
**Why:** the server still trusts client-reported ball positions and the `scratched`
flag (`docs/security/economy.md`, `poolHandler.ts`). Acceptable while pool is a pure
sink, but it must be closed before any reward/ranking/wager.

**Tasks**
- Extract the physics stepper from `apps/client/src/ui/poolCanvasRenderer.ts` /
  `PoolOverlay` into a **pure, deterministic module in `packages/shared`** (fixed
  timestep, integer/seeded math — no `Math.random`, no wall-clock).
- On `pool-shot`, the server runs that stepper from the stored pre-shot state and
  the validated shot, computing authoritative final balls + scratch + pots itself.
  `pool-sync` becomes a presentation hint only (already partly true).
- Unit-test determinism (same input → identical output) on client and server.

**Acceptance**
- [ ] A forged `pool-sync` cannot change the outcome (extends `poolAuthority.test.ts`).
- [ ] Server-computed and client-rendered final states match for a battery of shots.
- [ ] No `Math.random`/clock reads in the shared stepper.

## O15 — Complete the safety suite (launch-blocking)
**Pri:** P1 · **Area:** trust & safety · **Continues:** O7
**Why:** a consumer voice+chat product cannot open to the public with only
block/report. Missing pieces are legal/operational risk.

**Tasks**
- **Age gate + ToS/consent** recorded at signup (timestamp + version).
- **Room moderation:** host (or trust-role) **mute/kick**; a **global ban list**
  enforced on socket connect (reject banned users) and on room join.
- Wire `moderateChatText` into **every** inbound chat/whisper path; enforce length +
  rate limit; guarantee no raw HTML reaches the HUD.
- Minimal **report-review** surface (admin-only) listing `moderation_reports` with
  status transitions.

**Acceptance**
- [ ] Banned user cannot connect; kicked user leaves the room immediately.
- [ ] Every chat path is filtered; a scripted XSS payload renders inert.
- [ ] Signup without age/ToS acceptance is rejected and recorded when accepted.

## O16 — Progression & return loop
**Pri:** P2 · **Area:** retention · **Implements:** O10
**Why:** nothing rewards coming back beyond chat; the petal economy has a faucet
and (now) a shop sink but no progression.

**Tasks**
- XP/levels from activity, **daily quests**, and a presence **streak** with
  escalating rewards — all server-authoritative and **ledgered** (reuse O2).
- Cooldown/anti-farm guards mirroring the petal cooldown pattern.
- Surface level/streak/quest progress in the HUD; notify on milestones.

**Acceptance**
- [ ] Quests/streaks award via the ledger and cannot be farmed past cooldowns.
- [ ] Progress persists across sessions and is shown in the HUD.

## O17 — DB-backed CI + formal migrations
**Pri:** P0 · **Area:** correctness/ops
**Why:** the economy now depends on Postgres, but CI (`.github/workflows/ci.yml`)
runs with `REDIS_MOCK=true` and likely **no Postgres**, so the ledger/transaction
paths aren't exercised in CI. Schema management also needs to be reproducible.

**Tasks**
- Add a `postgres` service to the CI workflow; run the DB-backed `UserService`/
  ledger/moderation/social tests against it.
- Formalize migrations: a numbered migration dir + `pnpm --filter server migrate`
  (or `node-pg-migrate`); `init.sql` becomes `0001`. Document the
  `import:redis-users` cutover and add a test for it.
- Add an integration test asserting the **ledger invariant** (`SUM(delta) == users.petals`).

**Acceptance**
- [ ] CI provisions Postgres and the DB-backed suites run (and pass) there.
- [ ] `migrate` builds the schema from empty reproducibly; invariant test passes.

## O18 — Frontend performance: code-split Phaser/LiveKit
**Pri:** P1 · **Area:** performance
**Why:** the production build warns chunks exceed 500 kB; `phaser` (~1.48 MB) and
`livekit` (~506 kB) ship eagerly — bad first load for an "always-open tab".

**Tasks**
- Lazy-load LiveKit/voice via dynamic `import()` (only when voice is enabled).
- Configure `build.rollupOptions.output.manualChunks` to split vendors; verify the
  CSP from O5 permits the media/worker origins LiveKit needs.
- Record before/after gzip sizes; add a bundle-size budget note.

**Acceptance**
- [ ] No eager chunk > ~700 kB except unavoidable Phaser core; LiveKit loads on demand.
- [ ] App + voice work end-to-end under the production CSP.

## O19 — Wallet & shop observability + reconciliation
**Pri:** P1 · **Area:** economy ops · **Continues:** O2/O9
**Why:** with a ledger in place, add the guardrails and analytics it unlocks.

**Tasks**
- Confirm **every** shop purchase spends via the O2 ledger with an idempotency key;
  enforce ownership/equip server-side (no client-granted cosmetics).
- Add a periodic/admin **reconciliation** check (ledger sum vs balance) that alerts
  on drift; expose economy counters via the admin `/metrics`.
- Add ledger-derived analytics (faucet vs sink per source) behind admin auth.

**Acceptance**
- [ ] Purchases are idempotent and ownership is server-enforced (tests).
- [ ] A seeded drift is detected by the reconciliation check.

## O20 — Whispers/DMs + presence polish
**Pri:** P2 · **Area:** product · **Continues:** O11
**Tasks**
- Direct messages/whispers between users, subject to O7/O15 block + moderation.
- Friend presence (online/room) and "join friend"; basic unread indicators.

**Acceptance**
- [ ] Whispers deliver only when not blocked and are moderated; offline handling defined.
- [ ] Friend presence updates live; "join friend" lands in their room.

## O21 — New mini-game + events/leaderboards
**Pri:** P2 · **Area:** product · **Continues:** O12 · **Depends on:** O14 pattern
**Tasks**
- One new mini-game reusing the interaction pattern, with **server-authoritative**
  shared rule logic (follow the O14 model) and tests.
- Timed events + leaderboards with limited-time cosmetics (ledgered rewards).

**Acceptance**
- [ ] The new game is server-authoritative where score/petals are involved.
- [ ] Leaderboards/events are persisted and reset on schedule.

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
- **Pool rule logic** is pure and lives in `packages/shared`; after O14 the physics
  stepper is shared and the **server** is authoritative for outcomes.
- **Redis** holds only ephemeral state (presence, room/object state, cooldowns,
  rate limits) — **never** the wallet. `REDIS_MOCK=true` keeps the server bootable
  for tests/local dev.
- **Economy goes through one transactional, idempotent, ledgered path** (O2). No
  handler may mutate `petals` directly; shop/quests/events reuse it.
