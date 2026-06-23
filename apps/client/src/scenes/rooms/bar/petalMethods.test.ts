import { PETAL_SPAWN_CONFIGS, petalPointKey, type Position } from '@social-square/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../../../store/gameStore';
import {
  PETAL_BURST_COUNT,
  PETAL_PENDING_TIMEOUT_MS,
  acceptPetalServerTotal,
  adjustPetals,
  collectPetalBloom,
  confirmPetalCollected,
  petalCollectRequestId,
  removeOptimisticPetalCredit,
  rollbackPendingPetalCollect,
  setPetalTotal,
  spawnPetalBloom,
  spawnPetalCollectBurst,
  sweepStalePetalCollects,
  type PendingPetalCollect,
  type PetalBloom,
} from './petalMethods';
import { PETAL_AUTO_COLLECT_CHECK_MS } from './timing';
import type { BarSceneContext } from './barSceneContext';

vi.mock('../../../entities/InteractStation', () => ({
  InteractStation: class {
    destroy = vi.fn();
  },
}));

vi.mock('./stationIcons', () => ({
  drawPetalBloom: vi.fn(),
}));

const TEST_LOCATION_ID = '0,1';
const TEST_PETAL_POINT = PETAL_SPAWN_CONFIGS[TEST_LOCATION_ID].points[0];

function pending(
  position: Position,
  amount = 25,
  requestedAt = Date.now(),
  requestId = petalCollectRequestId(petalPointKey(position)),
): PendingPetalCollect {
  return {
    position,
    pointKey: petalPointKey(position),
    requestId,
    amount,
    requestedAt,
  };
}

function petalContext() {
  return {
    _pendingPetalCollects: new Map<string, PendingPetalCollect>(),
    _petalAttemptCooldowns: new Map<string, number>(),
    _petalBlooms: [] as PetalBloom[],
    _currentLocationId: () => TEST_LOCATION_ID,
    _pendingPetalValue() {
      let total = 0;
      this._pendingPetalCollects.forEach((entry: PendingPetalCollect) => {
        total += entry.amount;
      });
      return total;
    },
    _acceptPetalServerTotal(petals: number) {
      acceptPetalServerTotal.call(this as unknown as BarSceneContext, petals);
    },
    _removeOptimisticPetalCredit(pending: PendingPetalCollect) {
      removeOptimisticPetalCredit.call(this as unknown as BarSceneContext, pending);
    },
    _removePetalBloom: vi.fn(),
    _spawnPetalCollectBurst: vi.fn(),
    _playPetalCollectSound: vi.fn(),
    _syncLocalContext: vi.fn(),
    _showNotice: vi.fn(),
    _createPetalBloom: vi.fn((position: Position) => ({ position, station: { destroy: vi.fn() } })),
    _isNear: vi.fn(() => true),
    _syncPetalPositionForServer: vi.fn(() => ({ x: 3, y: 35 })),
    _network: { emitInteract: vi.fn() },
    worldMap: { getTile: vi.fn(() => ({ walkable: true })) },
  };
}

function makeBloomAt(ctx: ReturnType<typeof petalContext>, position: Position): PetalBloom {
  const bloom: PetalBloom = {
    position: { ...position },
    station: { destroy: vi.fn() } as unknown as import('../../../entities/InteractStation').InteractStation,
  };
  ctx._petalBlooms.push(bloom);
  return bloom;
}

describe('petal collection timing', () => {
  beforeEach(() => {
    useGameStore.setState({ petals: 0 });
  });

  it('keeps auto collect responsive without running every frame', () => {
    expect(PETAL_AUTO_COLLECT_CHECK_MS).toBeGreaterThanOrEqual(80);
    expect(PETAL_AUTO_COLLECT_CHECK_MS).toBeLessThanOrEqual(120);
  });

  it('keeps optimistic petals when an older server total confirms one pending collect', () => {
    const ctx = petalContext();
    const first = { x: 9, y: 8 };
    const second = { x: 10, y: 8 };
    const firstRequestId = petalCollectRequestId(petalPointKey(first));
    const secondRequestId = petalCollectRequestId(petalPointKey(second));
    ctx._pendingPetalCollects.set(firstRequestId, pending(first, 25, Date.now(), firstRequestId));
    ctx._pendingPetalCollects.set(
      secondRequestId,
      pending(second, 25, Date.now(), secondRequestId),
    );
    useGameStore.setState({ petals: 50 });

    confirmPetalCollected.call(ctx as unknown as BarSceneContext, first, 25, 25, firstRequestId);

    expect(useGameStore.getState().petals).toBe(50);
    expect(ctx._pendingPetalCollects.has(firstRequestId)).toBe(false);
    expect(ctx._pendingPetalCollects.has(secondRequestId)).toBe(true);
  });

  it('lets newer optimistic petal totals win over stale server totals', () => {
    const ctx = petalContext();
    useGameStore.setState({ petals: 75 });

    acceptPetalServerTotal.call(ctx as unknown as BarSceneContext, 50);

    expect(useGameStore.getState().petals).toBe(75);
  });

  it('does not remove optimistic petals just because the server check is slow', () => {
    const ctx = petalContext();
    const position = { x: 9, y: 8 };
    const requestId = petalCollectRequestId(petalPointKey(position));
    ctx._pendingPetalCollects.set(
      requestId,
      pending(position, 25, Date.now() - PETAL_PENDING_TIMEOUT_MS - 1, requestId),
    );
    useGameStore.setState({ petals: 25 });

    sweepStalePetalCollects.call(ctx as unknown as BarSceneContext);

    expect(useGameStore.getState().petals).toBe(25);
    expect(ctx._pendingPetalCollects.get(requestId)?.serverCheckTimedOut).toBe(true);
  });

  it('rolls back only when the server explicitly rejects the collect', () => {
    const ctx = petalContext();
    const position = TEST_PETAL_POINT;
    const requestId = petalCollectRequestId(petalPointKey(position));
    ctx._pendingPetalCollects.set(requestId, pending(position, 25, Date.now(), requestId));
    useGameStore.setState({ petals: 25 });

    rollbackPendingPetalCollect.call(ctx as unknown as BarSceneContext, requestId, 'Petali non validi');

    expect(useGameStore.getState().petals).toBe(0);
    expect(ctx._pendingPetalCollects.has(requestId)).toBe(false);
    expect(ctx._showNotice).toHaveBeenCalledWith('Petali non validi');
  });

  it('uses a unique request id for each collect at the same point', () => {
    const ctx = petalContext();
    const bloom = {
      position: TEST_PETAL_POINT,
      station: { destroy: vi.fn() },
    } as unknown as PetalBloom;

    collectPetalBloom.call(ctx as unknown as BarSceneContext, bloom);
    const firstPayload = ctx._network.emitInteract.mock.calls[0][2];
    const firstRequestId = firstPayload.requestId;
    ctx._pendingPetalCollects.clear();
    ctx._petalAttemptCooldowns.clear();
    collectPetalBloom.call(ctx as unknown as BarSceneContext, bloom);
    const secondRequestId = ctx._network.emitInteract.mock.calls[1][2].requestId;

    expect(firstRequestId).not.toBe(petalPointKey(TEST_PETAL_POINT));
    expect(firstPayload).toMatchObject({ playerX: 3, playerY: 35 });
    expect(secondRequestId).not.toBe(firstRequestId);
  });

  it('does not respawn a collected point while the client cooldown is active', () => {
    const ctx = petalContext();
    const pointKey = petalPointKey(TEST_PETAL_POINT);
    ctx._petalBlooms = PETAL_SPAWN_CONFIGS[TEST_LOCATION_ID].points
      .filter((point) => petalPointKey(point) !== pointKey)
      .map((position) => ({ position, station: { destroy: vi.fn() } }) as unknown as PetalBloom);
    ctx._petalAttemptCooldowns.set(
      pointKey,
      Date.now() + PETAL_SPAWN_CONFIGS[TEST_LOCATION_ID].intervalMs,
    );

    const spawned = spawnPetalBloom.call(ctx as unknown as BarSceneContext);

    expect(spawned).toBe(false);
    expect(ctx._petalBlooms.some((bloom) => petalPointKey(bloom.position) === pointKey)).toBe(
      false,
    );
  });
});

describe('optimistic petal lifecycle invariants', () => {
  beforeEach(() => {
    useGameStore.setState({ petals: 0 });
  });

  it('second collect of the same bloom is a no-op (guards double-collect)', () => {
    const ctx = petalContext();
    const bloom = makeBloomAt(ctx, TEST_PETAL_POINT);
    // Mock the network emit so we can track calls
    const emitInteract = vi.fn();
    ctx._network = { emitInteract, emitMove: vi.fn() } as any;

    collectPetalBloom.call(ctx as unknown as BarSceneContext, bloom, true);
    const sizeAfterFirst = ctx._pendingPetalCollects.size;
    // bloom is now removed; calling again with the same bloom object should be a no-op
    collectPetalBloom.call(ctx as unknown as BarSceneContext, bloom, true);
    expect(ctx._pendingPetalCollects.size).toBe(sizeAfterFirst); // still 1
    expect(emitInteract).toHaveBeenCalledTimes(1); // only emitted once
  });

  it('error rollback restores optimistic petal credit and re-shows the bloom', () => {
    const ctx = petalContext();
    ctx._network = { emitInteract: vi.fn(), emitMove: vi.fn() } as any;
    useGameStore.getState().setPetals(0);
    const bloom = makeBloomAt(ctx, TEST_PETAL_POINT);

    collectPetalBloom.call(ctx as unknown as BarSceneContext, bloom, true);
    const reqId = [...ctx._pendingPetalCollects.keys()][0];
    const creditedAmount = useGameStore.getState().petals;
    expect(creditedAmount).toBeGreaterThan(0); // optimistic credit was applied

    rollbackPendingPetalCollect.call(ctx as unknown as BarSceneContext, reqId, 'TOO_FAR');
    expect(useGameStore.getState().petals).toBeLessThan(creditedAmount); // credit removed
    // Bloom should be restored at the original position
    expect(
      ctx._petalBlooms.some((b) => petalPointKey(b.position) === petalPointKey(TEST_PETAL_POINT)),
    ).toBe(true);
  });

  it('confirm with stale/unknown requestId still sets petals from server total', () => {
    const ctx = petalContext();
    useGameStore.getState().setPetals(0);
    // No pending collects at all — simulates a late server reply after client reset
    confirmPetalCollected.call(
      ctx as unknown as BarSceneContext,
      TEST_PETAL_POINT,
      25,
      999,
      'nonexistent-req',
    );
    // Server said total is 999; pending is 0; so store should reflect ≥999
    expect(useGameStore.getState().petals).toBeGreaterThanOrEqual(999);
  });
});

describe('spawnPetalCollectBurst', () => {
  it('creates at most PETAL_BURST_COUNT + 1 display objects', () => {
    const ctx = petalContext();
    const created: unknown[] = [];
    const stub = () => ({ fillStyle: vi.fn().mockReturnThis(), fillEllipse: vi.fn().mockReturnThis(), setDepth: vi.fn().mockReturnThis(), setRotation: vi.fn().mockReturnThis(), destroy: vi.fn(), x: 0, y: 0 });
    const textStub = () => ({ setOrigin: vi.fn().mockReturnThis(), setDepth: vi.fn().mockReturnThis(), destroy: vi.fn(), x: 0, y: 0 });
    (ctx as any).add = {
      graphics: () => { const g = stub(); created.push(g); return g; },
      text: () => { const t = textStub(); created.push(t); return t; },
    };
    (ctx as any).tweens = { add: ({ onComplete }: any) => { onComplete?.(); return {}; } };
    spawnPetalCollectBurst.call(ctx as unknown as BarSceneContext, TEST_PETAL_POINT, 25);
    expect(created.length).toBeLessThanOrEqual(PETAL_BURST_COUNT + 1);
  });
});

describe('petal balance helpers', () => {
  beforeEach(() => { useGameStore.getState().setPetals(0); });

  it('adjustPetals adds delta to store', () => {
    adjustPetals(25);
    expect(useGameStore.getState().petals).toBe(25);
  });

  it('adjustPetals clamps at zero (cannot go negative)', () => {
    useGameStore.getState().setPetals(10);
    adjustPetals(-999);
    expect(useGameStore.getState().petals).toBe(0);
  });

  it('setPetalTotal sets absolute value clamped at zero', () => {
    setPetalTotal(500);
    expect(useGameStore.getState().petals).toBe(500);
    setPetalTotal(-1);
    expect(useGameStore.getState().petals).toBe(0);
  });

  it('removeOptimisticPetalCredit cannot drive balance below zero', () => {
    const ctx = petalContext();
    useGameStore.getState().setPetals(10);
    const p = pending(TEST_PETAL_POINT, 999); // amount bigger than balance
    removeOptimisticPetalCredit.call(ctx as unknown as BarSceneContext, p);
    expect(useGameStore.getState().petals).toBe(0); // clamped
  });
});
