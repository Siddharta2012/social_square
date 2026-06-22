import { PETAL_SPAWN_CONFIGS, petalPointKey, type Position } from '@social-square/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../../../store/gameStore';
import {
  PETAL_PENDING_TIMEOUT_MS,
  acceptPetalServerTotal,
  confirmPetalCollected,
  removeOptimisticPetalCredit,
  rollbackPendingPetalCollect,
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

function pending(position: Position, amount = 25, requestedAt = Date.now()): PendingPetalCollect {
  return {
    position,
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
    ctx._pendingPetalCollects.set(petalPointKey(first), pending(first));
    ctx._pendingPetalCollects.set(petalPointKey(second), pending(second));
    useGameStore.setState({ petals: 50 });

    confirmPetalCollected.call(ctx, first, 25, 25, petalPointKey(first));

    expect(useGameStore.getState().petals).toBe(50);
    expect(ctx._pendingPetalCollects.has(petalPointKey(first))).toBe(false);
    expect(ctx._pendingPetalCollects.has(petalPointKey(second))).toBe(true);
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
    const key = petalPointKey(position);
    ctx._pendingPetalCollects.set(key, pending(position, 25, Date.now() - PETAL_PENDING_TIMEOUT_MS - 1));
    useGameStore.setState({ petals: 25 });

    sweepStalePetalCollects.call(ctx);

    expect(useGameStore.getState().petals).toBe(25);
    expect(ctx._pendingPetalCollects.get(key)?.serverCheckTimedOut).toBe(true);
  });

  it('rolls back only when the server explicitly rejects the collect', () => {
    const ctx = petalContext();
    const position = TEST_PETAL_POINT;
    const key = petalPointKey(position);
    ctx._pendingPetalCollects.set(key, pending(position));
    useGameStore.setState({ petals: 25 });

    rollbackPendingPetalCollect.call(ctx, key, 'Petali non validi');

    expect(useGameStore.getState().petals).toBe(0);
    expect(ctx._pendingPetalCollects.has(key)).toBe(false);
    expect(ctx._showNotice).toHaveBeenCalledWith('Petali non validi');
  });
});
