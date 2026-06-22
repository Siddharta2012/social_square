import { Direction, POOL_PLAY_COST } from '@social-square/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../../../store/gameStore';
import { POOL_OBJECT_ID } from '../../../world/interactions';
import { requestPoolStart } from './poolMethods';

function poolContext() {
  return {
    _isInPoolLocation: vi.fn(() => true),
    _isNear: vi.fn(() => true),
    _localPosition: vi.fn(() => ({ x: 9, y: 8 })),
    _showPoolMessage: vi.fn(),
    _syncPoolPositionForServer() {
      const local = this._localPosition();
      this._network.emitMove(local.x, local.y, Direction.SE, 'idle', true);
      return local;
    },
    _network: {
      emitMove: vi.fn(),
      emitInteract: vi.fn(),
    },
  };
}

describe('pool interactions', () => {
  beforeEach(() => {
    useGameStore.setState({
      petals: POOL_PLAY_COST,
      poolMessage: null,
    });
  });

  it('syncs current position inside pool start requests', () => {
    const ctx = poolContext();

    requestPoolStart.call(ctx, 'pool-start-solo');

    expect(ctx._network.emitMove).toHaveBeenCalledWith(9, 8, Direction.SE, 'idle', true);
    expect(ctx._network.emitInteract).toHaveBeenCalledWith(
      POOL_OBJECT_ID,
      'pool-start-solo',
      expect.objectContaining({
        requestId: expect.stringMatching(/^pool-start-solo:/),
        playerX: 9,
        playerY: 8,
      }),
    );
    expect(ctx._network.emitMove.mock.invocationCallOrder[0]).toBeLessThan(
      ctx._network.emitInteract.mock.invocationCallOrder[0],
    );
  });
});
