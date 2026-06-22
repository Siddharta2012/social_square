# Social Square — 360° Improvement Plan (Codex Objective Mode)

> **Audience:** an autonomous coding agent (GPT Codex 5.5, *objective mode*).
> **Goal:** execute the objectives below one at a time, each as an independently
> shippable change, until the whole backlog is green.
> **Repo:** pnpm monorepo — `apps/client` (Phaser 3 + React HUD + Vite + Zustand),
> `apps/server` (Express + Socket.IO + ioredis + zod + JWT), `packages/shared`
> (types + game constants + pure logic). Deploy: Railway (`railway.toml`).

---

## 0. How to work (objective-mode protocol)

For **every** objective `O*`:

1. **One objective = one branch = one PR.** Branch name: `chore/<id>-<slug>` or
   `feat/…` / `fix/… ` matching the change type. Never work on `main`.
2. **Read before writing.** Open the files named in the objective and the code
   around them; match existing style (comment density, naming, English comments).
3. **Stay in scope.** Do only what the objective's *Tasks* describe. If you find
   an unrelated problem, note it in the PR body under "Follow-ups", don't fix it.
4. **Definition of Done (DoD) — must all pass before opening the PR:**
   ```bash
   pnpm --filter shared build        # shared types/logic must emit for consumers
   pnpm -r typecheck                 # add this script where missing (see O1)
   pnpm -r lint                      # must exist & pass after O2
   pnpm -r test                      # all unit tests green
   pnpm build                        # full production build (exit 0)
   ```
   Paste the command output (or a faithful summary) into the PR body. Do not
   claim success without running them.
5. **Tests are part of the change**, not optional. New logic ships with unit
   tests; bug fixes ship with a regression test that fails before the fix.
6. **Conventional Commits.** End each commit message body with:
   `Co-Authored-By: GPT Codex 5.5 <noreply@openai.com>` (or the configured author).
7. **Never commit** `dist/`, `*.log`, `.env`, or `node_modules` (already in
   `.gitignore` — keep it that way).
8. **Acceptance criteria are binding.** An objective is "done" only when every
   checkbox under *Acceptance* is verifiably true.

**Suggested execution order:** P0 → P1 → P2. Within a priority, follow the listed
order (later objectives assume earlier ones, e.g. lint/CI exist before refactors).

---

## Priority map

| Pri | Objectives | Theme |
|-----|-----------|-------|
| **P0** | O1, O2, O3, O4 | Quality gates: typecheck/lint scripts, ESLint, CI, env validation |
| **P1** | O5, O6, O7, O8, O9, O10 | Security & server authority, dependency hygiene, handler modularization, shared tests, persistence/TTL, reconnect resync |
| **P2** | O11, O12, O13, O14, O15, O16, O17 | Performance, gameplay polish, i18n, observability, docs, accessibility, DX |

---

# P0 — Quality gates

## O1 — Uniform `typecheck` / `lint` / `test` scripts across all packages
**Area:** tooling · **Why:** the root `package.json` runs `pnpm -r lint` but no
package defines a `lint` script, and `packages/shared` has no `test`/`typecheck`
script. The DoD commands above must work repo-wide.

**Tasks**
- Add to `packages/shared/package.json`: `"typecheck": "tsc --noEmit"`,
  `"lint": "eslint . --max-warnings=0"`, `"test": "vitest run"` (see O8 for the
  vitest wiring) — and a `"build"` already exists.
- Add `"lint"` to `apps/client/package.json` and `apps/server/package.json`.
- Add a root `"typecheck": "pnpm -r typecheck"` script.
- Ensure `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test` resolve in every
  workspace (use `--if-present` only where a package legitimately has nothing to
  run, e.g. shared before O8).

**Acceptance**
- [ ] `pnpm -r typecheck` runs `tsc --noEmit` in all 3 packages and passes.
- [ ] `pnpm -r lint` runs in all 3 packages (passes after O2).
- [ ] `pnpm -r test` runs in all 3 packages (shared may be empty until O8).

## O2 — Introduce ESLint (flat config) + Prettier baseline
**Area:** tooling · **Why:** no ESLint config exists anywhere; style/quality is
unenforced. The team writes English comments and uses TS strictly — encode it.

**Tasks**
- Add a single root `eslint.config.js` (flat config) with `typescript-eslint`,
  `eslint-plugin-react` + `react-hooks` (client only), import-order, and
  `no-floating-promises` / `no-misused-promises` (critical for the socket code).
- Add the matching devDependencies at the root (or per package) and a
  `.prettierrc` (match existing 2-space, single-quote, semicolon style).
- Fix or `// eslint-disable-next-line` (with reason) all violations so
  `pnpm -r lint` is green. Prefer fixing over disabling.
- Do **not** mass-reformat unrelated files; keep the diff reviewable. If Prettier
  would churn the whole tree, scope it to changed files and add a follow-up note.

**Acceptance**
- [ ] `pnpm -r lint` exits 0 with `--max-warnings=0`.
- [ ] Rules flag unhandled promises in socket/handler code (verified on a sample).

## O3 — Continuous Integration (GitHub Actions)
**Area:** CI · **Why:** there is no `.github/` — nothing gates merges. The repo
has a GitHub remote, so CI is free leverage.

**Tasks**
- Add `.github/workflows/ci.yml`: trigger on `push` + `pull_request`. Steps:
  checkout → setup pnpm + Node 20 (cache pnpm store) → `pnpm install --frozen-lockfile`
  → `pnpm --filter shared build` → `pnpm -r typecheck` → `pnpm -r lint`
  → `pnpm -r test` → `pnpm build`.
- Run server tests with `REDIS_MOCK=true` (the code already supports the in-memory
  mock — see `apps/server/src/config/redis.ts`).
- Add a status badge to `README` (after O15).

**Acceptance**
- [ ] Workflow file is valid and runs the full DoD pipeline.
- [ ] A trivial PR shows all checks green in Actions.

## O4 — Boot-time environment validation with zod
**Area:** reliability · **Why:** the server reads many env vars (JWT secret, DB,
Redis, LiveKit keys). Missing/invalid values should fail fast with a clear error,
not crash deep in a request. `env.example` exists but isn't enforced.

**Tasks**
- Create `apps/server/src/config/env.ts` exporting a zod-parsed, typed `env`
  object (DATABASE_URL, REDIS_URL/REDIS_MOCK, JWT_SECRET, LIVEKIT_*, PORT, CORS
  origin, NODE_ENV). Parse once at startup; on failure log the missing keys and
  `process.exit(1)`.
- Replace scattered `process.env.X` reads with `env.X`.
- Update `env.example` to list every required key with a short comment.

**Acceptance**
- [ ] Starting the server without a required var prints a clear message and exits.
- [ ] No remaining direct `process.env` reads outside `config/env.ts` (grep).

---

# P1 — Security, correctness, architecture

## O5 — Server-authoritative economy & anti-cheat audit
**Area:** security · **Why:** petals (wallet), pool, and jukebox are economy-bearing
and partly **client-simulated/trusted**. Pool ball positions and outcomes arrive
from the client (`pool-sync`); petal collection is optimistic. Verify the server
is the source of truth for anything that touches the wallet.

**Tasks**
- Audit every petal/economy path in `apps/server/src/socket/handlers/roomHandlers.ts`
  and `apps/server/src/services/UserService.ts`: confirm petal awards/spends are
  authoritative, idempotent, and rate-limited; confirm the petal cooldown
  (`StateService.reservePetalCollect`) cannot be bypassed by replaying requests.
- For pool: the server already recomputes `potted` from the ball diff in
  `resolvePoolShot`; ensure `pool-sync` rejects implausible ball states (already
  partially done in `parsePoolBalls`) and that only the player whose turn it is
  can mutate state. Document the residual trust (client decides `scratched`) and
  add a server-side sanity bound (e.g. cap potted-per-shot, validate the shooter
  matches `turnUserId`).
- Verify rate-limit coverage: every `socket.emit('error', …)` that aborts an
  economy action must carry a `requestId` where the client tracks one (see the
  petal `requestId` invariant in `docs`/memory). Centralize the rate-limit helper
  so no path silently drops a request without telling the client.

**Acceptance**
- [ ] Written audit note (in the PR body or `docs/security/economy.md`) listing
      each economy action, its authority, idempotency, and rate limit.
- [ ] Regression tests: replaying a petal-collect during cooldown yields no double
      award; an out-of-turn `pool-shot` is rejected.
- [ ] No economy-aborting server error path lacks a `requestId` when the client
      has an in-flight optimistic entry keyed by one.

## O6 — Input validation coverage (zod) on all socket events
**Area:** security · **Why:** `zod` is a dependency but validation is ad-hoc
(`typeof payload.x === 'number'`). Untrusted socket payloads should be parsed.

**Tasks**
- Define zod schemas for every `interact` action payload and top-level
  `ClientToServerEvents` message in `packages/shared` (or `apps/server`), and parse
  at the handler boundary; reject with a typed error on failure.
- Keep messages user-safe (no internal details leaked to clients).
- Add tests for representative malformed payloads (NaN coords, oversized strings,
  wrong types) asserting graceful rejection.

**Acceptance**
- [ ] Each socket action validates its payload via a schema before use.
- [ ] Malformed-payload tests pass and the server never throws on bad input.

## O7 — Modularize `roomHandlers.ts` and `BarScene.ts`
**Area:** architecture · **Why:** `apps/server/src/socket/handlers/roomHandlers.ts`
(~1.2k lines) and `apps/client/src/scenes/rooms/BarScene.ts` (~1.8k lines) mix many
concerns, making them error-prone (the recent petal/pool bugs lived here).

**Tasks**
- Server: split `roomHandlers.ts` into focused modules under
  `apps/server/src/socket/handlers/` — e.g. `petalHandler.ts`, `poolHandler.ts`,
  `jukeboxHandler.ts`, `waiterHandler.ts`, `seatHandler.ts`, with `roomHandlers.ts`
  as the thin dispatcher. Pure helpers (rate limit, range checks) move to `utils/`.
- Client: extract the petal subsystem and the pool/overlay glue out of
  `BarScene.ts` into cohesive modules (e.g. `world/PetalField.ts`,
  `scenes/rooms/bar/*`). Keep behavior identical — this is a pure refactor.
- No behavior change; rely on existing + new tests to prove parity.

**Acceptance**
- [ ] No single handler/scene file exceeds ~600 lines.
- [ ] `pnpm -r test` and `pnpm build` stay green; behavior unchanged.

## O8 — Test runner for `packages/shared` + raise shared coverage
**Area:** testing · **Why:** shared holds pure, high-value logic (pool scoring,
state normalization, jukebox parsing) but has **no test runner** — its tests
currently live in `apps/client`.

**Tasks**
- Add `vitest` (config + devDep) to `packages/shared`; wire `"test"`/`"typecheck"`.
- Add unit tests for the pure functions: `normalizePoolState`, `resolvePoolShot`,
  `parsePoolBalls`/`serializePoolBalls` round-trips, jukebox parsing/normalization,
  interaction range/petal-key helpers, interest/coords math.
- Move the pool tests that belong to shared logic out of `apps/client` (or keep a
  thin client smoke test) to avoid duplication.

**Acceptance**
- [ ] `pnpm --filter shared test` runs and passes with meaningful coverage of the
      pure modules.
- [ ] `pnpm -r test` includes the shared suite.

## O9 — Redis state lifecycle: TTLs, cleanup, and Postgres migrations
**Area:** persistence · **Why:** live state lives in Redis; stale rooms/objects can
accumulate. DB schema is a single `scripts/init.sql` with no migration tooling.

**Tasks**
- Audit `StateService`: ensure every ephemeral key (room state, object state,
  presence, cooldowns) has a sensible TTL or explicit cleanup on room empty /
  disconnect. Add cleanup for finished/expired pool & jukebox sessions.
- Introduce a lightweight migration approach (e.g. numbered SQL files +
  `scripts/migrate.mjs`, or `node-pg-migrate`) so schema changes are reproducible;
  keep `init.sql` as migration `0001`.
- Document the data model (keys, TTLs, tables) in `docs/architecture/state.md`.

**Acceptance**
- [ ] No unbounded Redis keys for transient state (reviewed list in PR).
- [ ] `pnpm --filter server migrate` (or documented command) applies schema from
      empty DB reproducibly.

## O10 — Robust reconnect & state resync (client + server)
**Area:** reliability · **Why:** it's a "always-open tab" product; socket drops and
server restarts must recover cleanly (presence, room state, in-flight optimistic
actions like petals/pool).

**Tasks**
- Verify `NetworkSystem` reconnect logic re-joins the room and requests a full
  state snapshot; on resync, reconcile optimistic client state (petal pending
  collects, pool overlay) without double-counting or orphaning (build on the
  existing `requestId` + pending-timeout patterns).
- Server: on `join-room`, always send an authoritative full snapshot; ensure
  presence is idempotent across reconnects (no ghost avatars).
- Add an integration test simulating disconnect→reconnect mid-session.

**Acceptance**
- [ ] Disconnect/reconnect restores correct presence and balances; no ghosts, no
      lost/duplicated petals.
- [ ] Test covering the reconnect path passes.

---

# P2 — Performance, gameplay, polish, DX

## O11 — Frontend bundle performance (code-splitting & lazy load)
**Area:** performance · **Why:** the Vite build warns that chunks exceed 500 kB —
`phaser` (~1.48 MB) and `livekit` (~506 kB) ship eagerly, hurting first load for a
"tab always open" product.

**Tasks**
- Lazy-load LiveKit/voice only when the user enables voice (dynamic `import()`),
  so the audio stack isn't in the critical path.
- Configure `build.rollupOptions.output.manualChunks` to split vendor (phaser,
  react, livekit) deliberately; add a route/scene-level split where feasible.
- Add a bundle-size budget note and re-measure; record before/after gzip sizes.

**Acceptance**
- [ ] No eager chunk > ~700 kB except the unavoidable Phaser core; LiveKit loads
      on demand.
- [ ] Documented before/after sizes; app still works end-to-end (`pnpm build`).

## O12 — Pool game polish (rules depth + feel)
**Area:** gameplay · **Why:** scoring/outcomes now exist (`resolvePoolShot`); the
next layer makes it feel like real billiards.
**Depends on:** the current pool implementation in `apps/client/src/ui/PoolOverlay.tsx`
+ `packages/shared/src/constants/pool.ts`.

**Tasks**
- Add: legal-break handling, "ball-in-hand" after a scratch (let the player
  reposition the cue ball before the next shot), and a configurable rule set.
- Improve physics feel: tune friction/restitution; add cue-ball deflection
  (tangent line) to the aim guide so the predicted split is shown, not just the
  object-ball line.
- Add a short post-game summary (scores, fouls, best shot) and a rematch button.
- Keep all rule logic in `shared` (pure, unit-tested); the overlay stays a view.

**Acceptance**
- [ ] Ball-in-hand works after a scratch; aim guide shows cue deflection.
- [ ] New rule logic is unit-tested in `shared`; overlay verified in-app.

## O13 — Centralize UI strings (i18n-ready)
**Area:** UX · **Why:** Italian copy is hardcoded across components/scenes
(`"Servono N petali"`, pool messages, etc.), mixing logic and presentation.

**Tasks**
- Extract user-facing strings into a single `apps/client/src/i18n/` module
  (start with `it`), with a typed `t()` helper; server-emitted messages get keys
  too (send a code + params; let the client render copy).
- No new language required yet — just the seam, so future localization is a data
  change, not a code hunt.

**Acceptance**
- [ ] No hardcoded user-facing literals in components/scenes (grep for known
      phrases returns only the i18n module).
- [ ] Server emits stable error `code`s; client maps codes→copy.

## O14 — Observability: error tracking, health/readiness, metrics
**Area:** ops · **Why:** structured logs exist (`logInfo`/`logWarn`) but there's no
error capture, readiness probe, or metrics for a deployed product.

**Tasks**
- Add `/api/health` (liveness, already partial) and `/api/ready` (checks DB +
  Redis) endpoints; wire Railway health check to `/api/ready`.
- Add a client + server error reporter (e.g. Sentry, behind an env flag so it's
  no-op without a DSN). Capture unhandled promise rejections and socket errors.
- Emit basic counters (active rooms, connected sockets, economy events) via logs
  or a `/metrics` endpoint.

**Acceptance**
- [ ] `/api/ready` returns 503 when DB/Redis are down, 200 otherwise.
- [ ] Errors are captured when the DSN env is set; no-op when unset.

## O15 — Documentation: README, architecture, CONTRIBUTING
**Area:** docs · **Why:** onboarding docs are thin (`GAME_PLAN.md`, `docs/deploy`
only). A 360 product needs a clear entry point.

**Tasks**
- Write a top-level `README.md`: what it is, stack, quickstart (`docker-compose up`
  + `pnpm dev`), env setup, scripts, deploy summary, CI badge.
- `docs/architecture/overview.md`: monorepo layout, client/server/shared
  responsibilities, socket event flow, state model (link O9).
- `CONTRIBUTING.md`: branch/commit conventions, DoD, how to add a socket action.

**Acceptance**
- [ ] A new dev can go from clone → running locally using only the README.
- [ ] Architecture doc reflects the real event flow (spot-checked against code).

## O16 — Accessibility & input pass (HUD/overlays)
**Area:** UX/a11y · **Why:** React overlays (HUD, PoolOverlay) use raw divs/inline
styles; keyboard and screen-reader support is unverified.

**Tasks**
- Ensure interactive controls are real buttons/inputs with labels, focus styles,
  and keyboard operability (the pool "Tira", sliders, mode buttons).
- Respect `prefers-reduced-motion` for the heavier animations (petal bursts,
  speaking rings, cue strike).
- Add `aria-live` for transient notices already rendered as status text.

**Acceptance**
- [ ] Pool + HUD overlays are fully keyboard-operable; visible focus.
- [ ] Reduced-motion users get a calmer experience; verified via emulation.

## O17 — Dependency hygiene & DX
**Area:** maintenance · **Why:** small rot to clean: both `bcrypt` **and**
`bcryptjs` are dependencies; `@types/better-sqlite3` is present without an obvious
runtime; a stray root `pnpm.json`; committed `client.log`/`server.log` artifacts.

**Tasks**
- Pick one password-hashing lib (prefer `bcryptjs` for portability, or native
  `bcrypt` for speed) and remove the other + its `@types`. Update imports.
- Remove unused deps/types (verify with a grep + a clean install + build). If
  SQLite is an intended fallback, document it; otherwise drop the types.
- Investigate/remove the stray `pnpm.json`; remove tracked `*.log` files from the
  working tree (already gitignored) and confirm nothing depends on them.
- Add `pnpm dedupe` and an `engines` field (Node 20, pnpm version) to root.

**Acceptance**
- [ ] Exactly one bcrypt implementation remains; build + auth tests pass.
- [ ] No unused top-level deps; `pnpm install` + `pnpm build` clean from scratch.

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
All six must exit 0. New behavior has tests. Bug fixes have a regression test that
failed before the change. Diff is scoped to the objective. PR body lists what was
verified and any out-of-scope follow-ups.

## Appendix B — Known invariants to preserve

- **Petal collection** is optimistic and reconciled by absolute totals; every
  server reply/error for `petal-collect` must carry the `requestId`, and pending
  collects self-heal via a timeout. Don't regress this (see the petal protocol).
- **Pool** rule logic is pure and lives in `packages/shared` (`resolvePoolShot`);
  the overlay is a view. Keep scoring server-resolved at `pool-sync`.
- **Redis mock** (`REDIS_MOCK=true`) must keep the server bootable without a real
  Redis (used by tests and local dev).
```
