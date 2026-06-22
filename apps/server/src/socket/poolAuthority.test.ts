import {
  defaultPoolBalls,
  normalizePoolState,
  serializePoolBalls,
  type PoolBall,
} from '@social-square/shared';
import { describe, expect, it } from 'vitest';
import { validatePoolSyncHint } from './handlers/poolHandler';

function pocketAllObjectBalls(balls: PoolBall[]): PoolBall[] {
  return balls.map((ball) => (ball.id === 'cue' ? ball : { ...ball, pocketed: true }));
}

describe('server-authoritative pool sync', () => {
  it('rejects a forged all-pocketed sync as a presentation hint only', () => {
    const state = normalizePoolState({
      phase: 'playing',
      mode: 'duo',
      players: [
        { userId: 'a', username: 'Ada', joinedAt: 1 },
        { userId: 'b', username: 'Ben', joinedAt: 2 },
      ],
      turnUserId: 'a',
      balls: defaultPoolBalls(),
      lastShot: {
        shotId: 'shot-1',
        userId: 'a',
        angle: 0,
        power: 0.5,
        createdAt: 10,
      },
    }, 20);

    const hint = validatePoolSyncHint(state, 'a', {
      balls: serializePoolBalls(pocketAllObjectBalls(state.balls)),
      scratched: false,
    });

    expect(hint).toMatchObject({ ok: false, code: 'POOL_SYNC_REJECTED' });
    expect(state.phase).toBe('playing');
    expect(state.winnerUserId).toBeUndefined();
  });
});
