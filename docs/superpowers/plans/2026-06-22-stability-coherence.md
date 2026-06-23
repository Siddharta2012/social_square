# Stability & Coherence Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the recent rise in crashes/lag in the Bar room by closing the type-safety hole opened by the BarScene decomposition, guarding the fragile optimistic sync layer with tests, fixing resource leaks, and trimming per-frame work — all without regressing the systems that already work.

**Architecture:** The Bar room was split from a monolithic `BarScene` into ~20 `bar/*Methods.ts` modules invoked via `fn.call(this)` with `this: any`. That erased internal type checking, so runtime bugs now pass CI. This plan introduces one shared `BarSceneContext` interface, retypes every method module against it, then hardens the highest-churn subsystems (petals, audio, per-frame loop). Server stays authoritative; client stays optimistic only where already designed to be.

**Tech Stack:** TypeScript (strict), Phaser 3, React + Zustand HUD, Vitest, Socket.IO. pnpm monorepo (`apps/client`, `apps/server`, `packages/shared`).

**Non-negotiable invariants to preserve** (from `docs/IMPROVEMENT_PLAN_1_22062026.md` Appendix B):
- Petal collection stays optimistic, reconciled by absolute totals, every reply/error carries `requestId`, pending collects self-heal via timeout + per-point cooldown.
- Economy goes through the one transactional ledger path; no handler mutates `petals` directly server-side.
- Redis holds only ephemeral state; `REDIS_MOCK=true` keeps the server bootable.

**Definition of Done for every task:** the listed test command passes AND `pnpm -r typecheck` exits 0. Run server tests with `REDIS_MOCK=true`.

---

## File Structure

**New files:**
- `apps/client/src/scenes/rooms/bar/barSceneContext.ts` — the single `BarSceneContext` interface every `*Methods.ts` module types `this` against. One responsibility: describe the scene surface the modules touch.

**Modified files (P0 retyping — replace `this: any` with `this: BarSceneContext`):**
- `apps/client/src/scenes/rooms/bar/petalMethods.ts`, `poolMethods.ts`, `jukeboxMethods.ts`, `networkMethods.ts`, `stationMethods.ts`, `seatMethods.ts`, `waiterMethods.ts`, `voiceMethods.ts`, `locationMethods.ts`, `remoteMethods.ts`, `shutdownMethods.ts`

**Modified files (P1/P2 hardening):**
- `apps/client/src/audio/JukeboxPlayer.ts` — close AudioContext on destroy.
- `apps/client/src/scenes/rooms/BarScene.ts` — listener-leak guard on `create`, lighter `update`.
- `apps/client/src/scenes/rooms/bar/petalMethods.ts` — pooled burst graphics; single petal-credit path.
- `apps/server/src/socket/handlers/roomUtils.ts` + `poolHandler.ts`/`petalHandler.ts` — stop writing client position hints into authoritative state.
- `docs/IMPROVEMENT_PLAN.md` — fold into the `_1_` plan.

**Test files:**
- `apps/client/src/scenes/rooms/bar/petalMethods.test.ts` (extend)
- `apps/client/src/audio/JukeboxPlayer.test.ts` (new)
- `apps/client/src/scenes/rooms/bar/barSceneContext.test.ts` (new, compile-time guard)

---

# Phase P0 — Restore type safety + lock the petal layer with tests

> Rationale: typecheck currently passes while verifying nothing inside the scene. Before changing any behavior, we (a) make the compiler check the scene again and (b) pin the petal reconciliation behavior with tests so later refactors can't regress it.

## Task 1: Define the shared `BarSceneContext` interface

**Files:**
- Create: `apps/client/src/scenes/rooms/bar/barSceneContext.ts`
- Create: `apps/client/src/scenes/rooms/bar/barSceneContext.test.ts`

- [ ] **Step 1: Write the failing test (a compile-time + value guard)**

The interface must at minimum cover the fields the existing `petalContext()` test helper in `petalMethods.test.ts` already relies on. This test asserts the interface exists and is structurally satisfiable by a minimal object.

```ts
// barSceneContext.test.ts
import { describe, expect, it } from 'vitest';
import type { BarSceneContext } from './barSceneContext';

describe('BarSceneContext', () => {
  it('is satisfiable by a minimal scene-like object', () => {
    // Compile-time check: this object must structurally match the optional surface.
    const ctx: Partial<BarSceneContext> = {
      _myUserId: 'u1',
      _pendingPetalCollects: new Map(),
      _petalAttemptCooldowns: new Map(),
      _petalBlooms: [],
    };
    expect(ctx._myUserId).toBe('u1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter client test -- barSceneContext`
Expected: FAIL — `Cannot find module './barSceneContext'`.

- [ ] **Step 3: Write the interface**

Build the interface by reading the private fields of `BarScene.ts:69-103` and the methods each `*Methods.ts` calls on `this`. Model it as the union of the scene's own fields/methods plus the Phaser `Scene` members the modules use (`add`, `tweens`, `time`, `input`, `events`, `scene`, plus the project's `BaseRoomScene` members like `worldMap`, `movementSystem`, `localAvatar`, `setLocalAvatarTile`, `setLocalAvatarState`, `destroyWorld`). Extend Phaser's type so we don't re-list engine members:

```ts
// barSceneContext.ts
import type Phaser from 'phaser';
import type {
  AvatarConfig, AvatarState, EmoteId, HeldItem, JukeboxState,
  ObjectState, OrderItemId, PoolBall, Position, WaiterState,
} from '@social-square/shared';
import type { JukeboxPlayer } from '../../../audio/JukeboxPlayer';
import type { InteractStation } from '../../../entities/InteractStation';
import type { RemoteAvatar } from '../../../entities/RemoteAvatar';
import type { NetworkSystem } from '../../../systems/NetworkSystem';
import type { VoiceSystem } from '../../../systems/VoiceSystem';
import type { LocationExit, LocationId } from '../../../world/locations';
import type { SeatDefinition } from '../../../world/interactions';
import type { PendingPetalCollect, PetalBloom } from './petalMethods';

/**
 * The surface that bar/*Methods.ts modules operate on via `fn.call(this)`.
 * Extends BaseRoomScene's runtime shape so engine members stay typed.
 * Every module MUST type its first param as `this: BarSceneContext` — never `any`.
 */
export interface BarSceneContext extends Phaser.Scene {
  // BaseRoomScene members the modules touch (mirror the real signatures):
  worldMap: { getTile: (x: number, y: number) => { walkable: boolean } | null };
  movementSystem: { isMoving: boolean; stopMovement: () => void };
  localAvatar: RemoteAvatar | null;
  setLocalAvatarTile: (x: number, y: number, state: AvatarState) => void;
  setLocalAvatarState: (state: AvatarState | null) => void;
  destroyWorld: () => void;

  // BarScene-owned state (mirror BarScene.ts field declarations exactly):
  _network: NetworkSystem;
  _voice: VoiceSystem | null;
  _myUserId: string | null;
  _remoteAvatars: Map<string, RemoteAvatar>;
  _movingRemoteAvatars: Set<string>;
  _stations: InteractStation[];
  _exitStations: InteractStation[];
  _petalBlooms: PetalBloom[];
  _pendingPetalCollects: Map<string, PendingPetalCollect>;
  _petalAttemptCooldowns: Map<string, number>;
  _lastPetalSpawnByLocation: Map<string, number>;
  _petalSpawnTimer: Phaser.Time.TimerEvent | null;
  _jukebox: JukeboxPlayer;
  _jukeboxState: JukeboxState;
  _poolState: ReturnType<typeof import('@social-square/shared').normalizePoolState>;
  _seatOccupants: Map<string, string>;
  _pendingSeat: SeatDefinition | null;
  _seatedSeatId: string | null;
  _waiterAvatar: RemoteAvatar | null;
  _waiterState: WaiterState;
  _deliveredOrderIds: Set<string>;
  _pendingExit: LocationExit | null;
  _mutedVoiceUsers: Set<string>;
  _speakingVoiceUsers: Set<string>;

  // The private methods modules call on `this` (delegation targets in BarScene.ts).
  // List the ones actually invoked cross-module; signatures must match BarScene.ts.
  _currentLocationId: () => LocationId | string;
  _localPosition: () => Position | null;
  _isNear: (position: Position, radius?: number) => boolean;
  _showNotice: (message: string) => void;
  _applyServerPetals: (petals: number) => void;
  _acceptPetalServerTotal: (petals: number) => void;
  _pendingPetalValue: () => number;
  _spawnPetalCollectBurst: (position: Position, amount: number) => void;
  _playPetalCollectSound: () => void;
  _createPetalBloom: (position: Position, amount: number) => PetalBloom;
  _removePetalBloom: (bloom: PetalBloom) => void;
  _collectPetalBloom: (bloom: PetalBloom, automatic?: boolean) => void;
  _syncPetalPositionForServer: () => Position | null;
  _spawnRemote: (userId: string, username: string, worldX: number, worldY: number, heldItem?: HeldItem, state?: AvatarState, avatarConfig?: AvatarConfig) => void;
  _destroyRemote: (userId: string) => void;
  _applyObjectState: (objectId: string, objectState: ObjectState) => void;
  _pickUp: (item: HeldItem) => void;
  _showPoolMessage: (message: string, tone: 'info' | 'error') => void;
  _isInPoolLocation: () => boolean;
  _syncPoolPositionForServer: () => Position | null;
  // …add the remaining cross-module `_*` methods as the compiler reports them.
}
```

> Note: this interface is the single source of truth. When Step 4 of later tasks surfaces a missing member, ADD it here rather than reintroducing `any`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter client test -- barSceneContext`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/scenes/rooms/bar/barSceneContext.ts apps/client/src/scenes/rooms/bar/barSceneContext.test.ts
git commit -m "refactor(bar): add shared BarSceneContext type for method modules"
```

## Task 2: Retype `petalMethods.ts` against `BarSceneContext`

**Files:**
- Modify: `apps/client/src/scenes/rooms/bar/petalMethods.ts` (every `this: any`)

- [ ] **Step 1: Make the typecheck the failing test**

Run baseline first: `pnpm --filter client typecheck` → expected PASS (vacuously, `any`).
The real check: after replacing `any`, typecheck must STILL pass. If it fails, the compiler has found a latent bug — fix the bug, do not revert the type.

- [ ] **Step 2: Replace the types**

In `petalMethods.ts`, change every `export function name(this: any, …)` to `export function name(this: BarSceneContext, …)` and add the import:

```ts
import type { BarSceneContext } from './barSceneContext';
```

Remove `any` casts that become unnecessary (e.g. `(bloom: PetalBloom)` callbacks are now inferred). Keep behavior identical.

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter client typecheck`
Expected: PASS. If FAIL → a real type error was hidden by `any`. Fix it in `petalMethods.ts` (or add the genuinely-missing member to `barSceneContext.ts`), then re-run.

- [ ] **Step 4: Run the petal tests to confirm no behavior change**

Run: `pnpm --filter client test -- petalMethods`
Expected: PASS (all 7 existing tests).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/scenes/rooms/bar/petalMethods.ts apps/client/src/scenes/rooms/bar/barSceneContext.ts
git commit -m "refactor(bar): type petalMethods against BarSceneContext"
```

## Tasks 3–11: Retype the remaining method modules (one task each)

Apply the **exact same recipe as Task 2**, one module per task/commit, in this order (fragile/high-churn first):
`poolMethods.ts` → `jukeboxMethods.ts` → `networkMethods.ts` → `stationMethods.ts` → `seatMethods.ts` → `waiterMethods.ts` → `voiceMethods.ts` → `locationMethods.ts` → `remoteMethods.ts` → `shutdownMethods.ts`.

For each module:

- [ ] **Step 1:** `pnpm --filter client typecheck` → PASS baseline.
- [ ] **Step 2:** Replace `this: any` with `this: BarSceneContext`; add the import; drop now-redundant casts.
- [ ] **Step 3:** `pnpm --filter client typecheck` → must PASS. Any failure is a latent bug the `any` was hiding — fix it (the point of this phase) or extend `barSceneContext.ts` with the truly-missing member.
- [ ] **Step 4:** `pnpm --filter client test` → PASS (whole client suite, to catch cross-module breakage).
- [ ] **Step 5:** Commit: `refactor(bar): type <module> against BarSceneContext`.

**Acceptance for the retyping arc:** `grep -rn "this: any" apps/client/src/scenes/rooms/bar/` returns nothing.

## Task 12: Regression tests for the optimistic petal lifecycle

**Files:**
- Modify: `apps/client/src/scenes/rooms/bar/petalMethods.test.ts`

These pin the invariants so the P1/P2 simplifications can't silently break them. Reuse the existing `petalContext()` helper.

- [ ] **Step 1: Write the failing tests**

```ts
it('double collect of the same point creates only one pending request', () => {
  const ctx = petalContext();
  const bloom = makeBloomAt(ctx, TEST_PETAL_POINT); // helper that pushes a bloom
  collectPetalBloom.call(ctx, bloom, true);
  collectPetalBloom.call(ctx, bloom, true); // second call must be a no-op
  expect(ctx._pendingPetalCollects.size).toBe(1);
});

it('error rollback restores the optimistic petal credit and re-shows the bloom', () => {
  const ctx = petalContext();
  useGameStore.getState().setPetals(0);
  const bloom = makeBloomAt(ctx, TEST_PETAL_POINT);
  collectPetalBloom.call(ctx, bloom, true);
  const reqId = [...ctx._pendingPetalCollects.keys()][0];
  const credited = useGameStore.getState().petals;
  rollbackPendingPetalCollect.call(ctx, reqId, 'TOO_FAR');
  expect(useGameStore.getState().petals).toBeLessThan(credited); // credit removed
  expect(ctx._petalBlooms.some((b) => petalPointKey(b.position) === petalPointKey(TEST_PETAL_POINT))).toBe(true);
});

it('confirm with a stale requestId still reconciles to the server total', () => {
  const ctx = petalContext();
  confirmPetalCollected.call(ctx, TEST_PETAL_POINT, 25, 999, 'nonexistent-req');
  expect(useGameStore.getState().petals).toBeGreaterThanOrEqual(999 - ctx._pendingPetalValue());
});
```

Add `makeBloomAt(ctx, point)` next to `petalContext()` if not present (pushes a `{ position, station: { destroy } }` into `ctx._petalBlooms` and returns it).

- [ ] **Step 2: Run to verify they fail or pass meaningfully**

Run: `pnpm --filter client test -- petalMethods`
Expected: the double-collect and rollback tests describe current intended behavior; if any FAIL, that is a real bug to fix in `petalMethods.ts` now (before P1). Document which.

- [ ] **Step 3: Make them pass**

If a test fails, fix `petalMethods.ts` minimally (e.g. guard double-collect via `pendingPetalForPoint`). If all pass, they stand as regression guards.

- [ ] **Step 4: Run**

Run: `pnpm --filter client test -- petalMethods`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/scenes/rooms/bar/petalMethods.test.ts apps/client/src/scenes/rooms/bar/petalMethods.ts
git commit -m "test(bar): pin optimistic petal lifecycle invariants"
```

---

# Phase P1 — Fix resource leaks & trim per-frame work

## Task 13: Close the AudioContext on JukeboxPlayer.destroy()

**Files:**
- Modify: `apps/client/src/audio/JukeboxPlayer.ts:156-164`
- Create: `apps/client/src/audio/JukeboxPlayer.test.ts`

**Why:** `destroy()` disconnects the graph but never `close()`s `_audioContext`. Browsers cap concurrent AudioContexts (~6); repeated bar enter/exit can exhaust them and throw on the next `new AudioContext()`.

- [ ] **Step 1: Write the failing test**

```ts
// JukeboxPlayer.test.ts
import { describe, expect, it, vi } from 'vitest';
import { JukeboxPlayer } from './JukeboxPlayer';

describe('JukeboxPlayer.destroy', () => {
  it('closes the AudioContext it created', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    // @ts-expect-error inject a fake context
    globalThis.AudioContext = vi.fn(() => ({
      createMediaElementSource: () => ({ connect: vi.fn(), disconnect: vi.fn() }),
      createGain: () => ({ connect: vi.fn(), disconnect: vi.fn(), gain: { setTargetAtTime: vi.fn() } }),
      createStereoPanner: () => ({ connect: vi.fn(), disconnect: vi.fn(), pan: { setTargetAtTime: vi.fn() } }),
      resume: vi.fn().mockResolvedValue(undefined),
      currentTime: 0, destination: {}, close,
    }));
    const player = new JukeboxPlayer();
    // force graph creation
    // @ts-expect-error access private for test
    player._ensureAudioGraph({ volume: 1 });
    player.destroy();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter client test -- JukeboxPlayer`
Expected: FAIL — `close` not called.

- [ ] **Step 3: Implement**

In `destroy()` after `_disconnectAudioGraph()`:

```ts
  destroy(): void {
    this._audio?.pause();
    this._audio = null;
    this._disconnectAudioGraph();
    if (this._audioContext && this._audioContext.state !== 'closed') {
      void this._audioContext.close().catch(() => undefined);
    }
    this._audioContext = null;
    this._hideExternalPlayer();
    for (const url of this._urls.values()) URL.revokeObjectURL(url);
    this._urls.clear();
    this._trackId = null;
  }
```

- [ ] **Step 4: Run**

Run: `pnpm --filter client test -- JukeboxPlayer` → PASS. Then `pnpm --filter client typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/audio/JukeboxPlayer.ts apps/client/src/audio/JukeboxPlayer.test.ts
git commit -m "fix(jukebox): close AudioContext on destroy to stop context leak"
```

## Task 14: Guard against duplicate event/keyboard listeners on scene re-entry

**Files:**
- Modify: `apps/client/src/scenes/rooms/BarScene.ts:158-224` (`create`)

**Why:** `create()` registers ~25 `eventBus` listeners + 6 keyboard listeners with inline arrows. If `create` ever runs without `_onShutdown` having fired (HMR, reconnect-driven restart), listeners stack → duplicate emits → doubled network sends and avatar spawns.

- [ ] **Step 1: Make the symptom observable**

There is no unit harness for Phaser `create`. Guard defensively instead: call the existing shutdown cleanup at the top of `create` so registration is always idempotent.

- [ ] **Step 2: Implement the idempotent guard**

At the very start of `create()`, before any `eventBus.on`:

```ts
  create(): void {
    super.create();
    // Idempotent listener registration: clear any stale bus/keyboard
    // subscriptions from a prior create that didn't shut down cleanly.
    this._removeSceneEventListeners();
    this._loadMutedVoiceUsers();
    // …rest unchanged
```

Extract the `eventBus.off(...)` + `this.input.keyboard?.off(...)` block currently in `shutdownMethods.onShutdown` (lines 7-38) into an exported `removeSceneEventListeners(this: BarSceneContext)` in `shutdownMethods.ts`, have `onShutdown` call it, and add the thin delegator `_removeSceneEventListeners()` to `BarScene`.

- [ ] **Step 3: Verify no behavior change**

Run: `pnpm --filter client test` → PASS. `pnpm --filter client typecheck` → PASS.

- [ ] **Step 4: Manual smoke (record result in PR):** enter Bar → exit to Menu → re-enter Bar; confirm via the debug overlay (`collectDebugExtras`) that `remotes` count and a single movement emit per move are unchanged (no doubling).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/scenes/rooms/BarScene.ts apps/client/src/scenes/rooms/bar/shutdownMethods.ts
git commit -m "fix(bar): make scene listener registration idempotent"
```

## Task 15: Pool the petal-burst graphics to cut per-collect allocation

**Files:**
- Modify: `apps/client/src/scenes/rooms/bar/petalMethods.ts:307-353` (`spawnPetalCollectBurst`)

**Why:** auto-collect runs every 96ms (`timing.ts`); each collect allocates 10 `Graphics` + 1 `Text` + 11 tweens, then destroys them. Under clustered petals this is a GC/render spike = the felt lag.

- [ ] **Step 1: Add a regression test for the cap**

```ts
it('spawnPetalCollectBurst creates a bounded number of objects', () => {
  const created: unknown[] = [];
  const ctx = petalContext();
  // @ts-expect-error inject fake add
  ctx.add = {
    graphics: () => { const g = fakeGraphics(); created.push(g); return g; },
    text: () => { const t = fakeText(); created.push(t); return t; },
  };
  // @ts-expect-error inject fake tweens
  ctx.tweens = { add: ({ onComplete }: any) => onComplete?.() };
  spawnPetalCollectBurst.call(ctx, TEST_PETAL_POINT, 25);
  expect(created.length).toBeLessThanOrEqual(11); // 10 petals + 1 text, unchanged contract
});
```

Add `fakeGraphics()`/`fakeText()` helpers returning chainable stubs (`fillStyle`, `fillEllipse`, `setDepth`, `setRotation`, `setOrigin`, `destroy` all return `this`).

- [ ] **Step 2: Run to verify it passes against current code**

Run: `pnpm --filter client test -- petalMethods`
Expected: PASS (documents the current 11-object ceiling as the contract).

- [ ] **Step 3: Reduce the particle count behind the same contract**

Lower the loop from 10 to 6 petals and reuse a single reusable `Text` style object (hoist the style literal to a module const so it isn't re-created each call):

```ts
const PETAL_BURST_TEXT_STYLE = {
  fontSize: '18px', color: '#fff4d0', fontFamily: 'monospace',
  fontStyle: 'bold', stroke: '#1a1206', strokeThickness: 4,
} as const;
const PETAL_BURST_COUNT = 6;
```

Use `PETAL_BURST_COUNT` in the loop and `PETAL_BURST_TEXT_STYLE` in `this.add.text(...)`. Update the test's upper bound to `PETAL_BURST_COUNT + 1`.

- [ ] **Step 4: Run**

Run: `pnpm --filter client test -- petalMethods` → PASS. `pnpm --filter client typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/scenes/rooms/bar/petalMethods.ts apps/client/src/scenes/rooms/bar/petalMethods.test.ts
git commit -m "perf(bar): bound and lighten petal collect burst"
```

---

# Phase P2 — Reduce client trust & consolidate

## Task 16: Stop persisting client position hints into authoritative state

**Files:**
- Modify: `apps/server/src/socket/handlers/roomUtils.ts:91-102` (`currentRoomUserForInteraction`)
- Test: `apps/server/src/socket/handlers/roomUtils.test.ts`

**Why:** `currentRoomUserForInteraction` calls `state.updatePosition(...)` with the client-supplied `playerX/playerY`. This lets the client teleport its server-side position via interaction payloads (contradicts the O4/O14 server-authority direction) and adds a write per interaction. We should use the hint only for the proximity check, not persist it.

- [ ] **Step 1: Write the failing test**

```ts
it('does not persist the client position hint into room state', async () => {
  const updateSpy = vi.spyOn(state, 'updatePosition');
  // arrange a room user at a known position, then call with a far hint
  const result = await currentRoomUserForInteraction(roomId, userId, { playerX: 99, playerY: 99 });
  expect(result?.position).toEqual({ x: 99, y: 99 }); // returned for the near-check
  expect(updateSpy).not.toHaveBeenCalled();           // but NOT written to state
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `REDIS_MOCK=true pnpm --filter server test -- roomUtils`
Expected: FAIL — `updatePosition` IS called today.

- [ ] **Step 3: Implement**

```ts
export async function currentRoomUserForInteraction(
  roomId: string, userId: string, payload?: ObjectState,
): Promise<RoomUser | null> {
  const user = await currentRoomUser(roomId, userId);
  if (!user) return null;
  const hintedPosition = positionHintFromPayload(payload);
  if (!hintedPosition) return user;
  // Use the hint for proximity checks only; movement is persisted via the
  // throttled 'move' channel, which remains the single source of position truth.
  return { ...user, position: hintedPosition };
}
```

- [ ] **Step 4: Run**

Run: `REDIS_MOCK=true pnpm --filter server test` → PASS. `pnpm --filter server typecheck` → PASS.

> Behavior note: the client already emits a forced `move` before each interaction (`syncPetalPositionForServer`/`syncPoolPositionForServer`), so the authoritative position is still fresh — we just stop the redundant, trust-the-payload write. Verify the petal/pool "TOO_FAR" flows still pass their existing tests.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/socket/handlers/roomUtils.ts apps/server/src/socket/handlers/roomUtils.test.ts
git commit -m "fix(server): use interaction position hint for proximity only, not persistence"
```

## Task 17: Funnel all client petal-balance writes through one helper

**Files:**
- Modify: `apps/client/src/scenes/rooms/bar/petalMethods.ts`

**Why:** `useGameStore.getState().setPetals(...)` is called from ≥6 spots (`collectPetalBloom`, `removeOptimisticPetalCredit`, `applyServerPetals`, `acceptPetalServerTotal`, …). Scattered writes are how the optimistic/server totals desync. One helper makes the reconciliation rule auditable.

- [ ] **Step 1: Write the failing test**

```ts
it('all balance mutations go through adjustPetals (never below zero)', () => {
  const ctx = petalContext();
  useGameStore.getState().setPetals(10);
  removeOptimisticPetalCredit.call(ctx, pending(TEST_PETAL_POINT, 999));
  expect(useGameStore.getState().petals).toBe(0); // clamped, not negative
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter client test -- petalMethods`
Expected: FAIL — current code can drive petals negative.

- [ ] **Step 3: Implement the single helper and route writes through it**

```ts
export function adjustPetals(delta: number): void {
  const store = useGameStore.getState();
  store.setPetals(Math.max(0, store.petals + delta));
}
export function setPetalTotal(total: number): void {
  useGameStore.getState().setPetals(Math.max(0, total));
}
```

Replace the inline `setPetals(getState().petals + amount)` / `- amount` calls with `adjustPetals(+amount)` / `adjustPetals(-pending.amount)`, and the absolute-total reconciliations with `setPetalTotal(...)`. Keep the `acceptPetalServerTotal` `Math.max(store.petals, server+pending)` semantics — just centralize the final write.

- [ ] **Step 4: Run**

Run: `pnpm --filter client test -- petalMethods` → PASS. `pnpm --filter client typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/scenes/rooms/bar/petalMethods.ts apps/client/src/scenes/rooms/bar/petalMethods.test.ts
git commit -m "refactor(bar): centralize petal balance writes, clamp at zero"
```

## Task 18: Merge the two improvement-plan docs

**Files:**
- Modify: `docs/IMPROVEMENT_PLAN.md`
- Modify: `docs/IMPROVEMENT_PLAN_1_22062026.md`

**Why:** two overlapping plans; `_1_` already says it "supersedes" the other but both remain, causing doc drift.

- [ ] **Step 1:** Move any objective still unique to `docs/IMPROVEMENT_PLAN.md` into the `_1_` plan's Phase 2 backlog.
- [ ] **Step 2:** Replace `docs/IMPROVEMENT_PLAN.md` body with a one-line pointer: `> Superseded by IMPROVEMENT_PLAN_1_22062026.md.`
- [ ] **Step 3:** Add this stability plan as a referenced sub-plan under the `_1_` plan's Phase 2.
- [ ] **Step 4:** No code; run nothing.
- [ ] **Step 5: Commit**

```bash
git add docs/IMPROVEMENT_PLAN.md docs/IMPROVEMENT_PLAN_1_22062026.md
git commit -m "docs: consolidate improvement plans into the 2026-06-22 plan"
```

---

## Final verification (run before opening any PR)

```bash
pnpm install --frozen-lockfile
pnpm --filter shared build
pnpm -r typecheck
pnpm -r lint
REDIS_MOCK=true pnpm -r test
pnpm build
```

All six must exit 0. Then: `grep -rn "this: any" apps/client/src/scenes/rooms/bar/` → no matches (P0 acceptance).

## Self-review checklist (done while writing)
- **Spec coverage:** each audit finding maps to a task — type hole→T1-11, petal fragility→T12/T17, AudioContext→T13, listener leak→T14, per-frame burst→T15, client-trusted position→T16, doc drift→T18. Concern #7 (reconnect resilience) is intentionally out of scope here (no repro) and noted as follow-up.
- **No placeholders:** every code step shows code; recipe tasks (3-11) repeat the full 5-step recipe rather than referencing Task 2 abstractly.
- **Type consistency:** `BarSceneContext`, `adjustPetals`/`setPetalTotal`, `removeSceneEventListeners`, `PETAL_BURST_COUNT` are named identically wherever referenced.

## Follow-ups (out of scope, file as separate issues)
- NetworkSystem: `reconnectionAttempts: 5` then silent death — add UI resync/visible "disconnected" state (audit concern #7; needs runtime repro).
- Consider a single shared AudioContext for jukebox + petal + voice instead of per-subsystem contexts.
