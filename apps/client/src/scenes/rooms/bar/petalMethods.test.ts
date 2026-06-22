import { PETAL_SPAWN_CONFIGS, petalPointKey, type Position } from '@social-square/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../../../store/gameStore';
import {
  PETAL_PENDING_TIMEOUT_MS,
  acceptPetalServerTotal,
  collectPetalBloom,
  confirmPetalCollected,
  petalCollectRequestId,
  removeOptimisticPetalCredit,
  rollbackPendingPetalCollect,
  spawnPetalBloom,
  sweepStalePetalCollects,
  type PendingPetalCollect,
  type PetalBloom,
} from './petalMethods';
import { PETAL_AUTO_COLLECT_CHECK_MS } from './timing';

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
      acceptPetalServerTotal.call(this, petals);
    },
    _removeOptimisticPetalCredit(pending: PendingPetalCollect) {
      removeOptimisticPetalCredit.call(this, pending);
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

    confirmPetalCollected.call(ctx, first, 25, 25, firstRequestId);

    expect(useGameStore.getState().petals).toBe(50);
    expect(ctx._pendingPetalCollects.has(firstRequestId)).toBe(false);
    expect(ctx._pendingPetalCollects.has(secondRequestId)).toBe(true);
  });

  it('lets newer optimistic petal totals win over stale server totals', () => {
    const ctx = petalContext();
    useGameStore.setState({ petals: 75 });

    acceptPetalServerTotal.call(ctx, 50);

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

    sweepStalePetalCollects.call(ctx);

    expect(useGameStore.getState().petals).toBe(25);
    expect(ctx._pendingPetalCollects.get(requestId)?.serverCheckTimedOut).toBe(true);
  });

  it('rolls back only when the server explicitly rejects the collect', () => {
    const ctx = petalContext();
    const position = TEST_PETAL_POINT;
    const requestId = petalCollectRequestId(petalPointKey(position));
    ctx._pendingPetalCollects.set(requestId, pending(position, 25, Date.now(), requestId));
    useGameStore.setState({ petals: 25 });

    rollbackPendingPetalCollect.call(ctx, requestId, 'Petali non validi');

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

    collectPetalBloom.call(ctx, bloom);
    const firstPayload = ctx._network.emitInteract.mock.calls[0][2];
    const firstRequestId = firstPayload.requestId;
    ctx._pendingPetalCollects.clear();
    ctx._petalAttemptCooldowns.clear();
    collectPetalBloom.call(ctx, bloom);
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

    const spawned = spawnPetalBloom.call(ctx);

    expect(spawned).toBe(false);
    expect(ctx._petalBlooms.some((bloom) => petalPointKey(bloom.position) === pointKey)).toBe(
      false,
    );
  });
});
