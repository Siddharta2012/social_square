import { describe, expect, it } from 'vitest';
import {
  POOL_MAX_POTTED_PER_SHOT,
  defaultPoolBalls,
  newlyPottedPoolBalls,
  normalizePoolState,
  parsePoolBalls,
  resolvePoolShot,
  simulatePoolShot,
  serializePoolBalls,
  type PoolBall,
  type PoolState,
} from './pool';

function playingState(overrides: Partial<PoolState> = {}): PoolState {
  return normalizePoolState({
    phase: 'playing',
    mode: 'duo',
    players: [
      { userId: 'a', username: 'Ada', joinedAt: 1 },
      { userId: 'b', username: 'Ben', joinedAt: 2 },
    ],
    turnUserId: 'a',
    balls: defaultPoolBalls(),
    ...overrides,
  }, 100);
}

function pocket(balls: PoolBall[], ...ids: string[]): PoolBall[] {
  return balls.map((ball) => (ids.includes(ball.id) ? { ...ball, pocketed: true } : ball));
}

describe('pool state and scoring', () => {
  it('round-trips serialized balls while clamping unsafe values', () => {
    const balls = defaultPoolBalls().map((ball) => (
      ball.id === 'cue' ? { ...ball, x: 0.3, y: 0.4, vx: 0.5, vy: -0.25 } : ball
    ));

    const parsed = parsePoolBalls(serializePoolBalls(balls));
    expect(parsed?.map(({ id, x, y, vx, vy }) => ({ id, x, y, vx, vy }))).toEqual(
      balls.map(({ id, x, y, vx, vy }) => ({ id, x, y, vx, vy })),
    );
    expect(parsePoolBalls('cue:999:999:99:99:0|bad')).toBeNull();
  });

  it('keeps the turn after a clean pot and rotates after a miss', () => {
    const state = playingState();

    const clean = resolvePoolShot(state, 'a', pocket(state.balls, '1'), false);
    expect(clean.scores.a).toBe(1);
    expect(clean.nextTurnUserId).toBe('a');

    const miss = resolvePoolShot(state, 'a', state.balls, false);
    expect(miss.nextTurnUserId).toBe('b');
    expect(miss.ballInHandUserId).toBe('b');
    expect(miss.outcome.illegalBreak).toBe(true);
  });

  it('counts newly potted balls for server sanity limits', () => {
    const state = playingState({ balls: pocket(defaultPoolBalls(), '1') });
    const settled = pocket(state.balls, '2', '3', '4', '5', '6');

    expect(newlyPottedPoolBalls(state.balls, settled)).toBe(5);
    expect(newlyPottedPoolBalls(state.balls, settled)).toBeGreaterThan(POOL_MAX_POTTED_PER_SHOT);
  });

  it('simulates shots deterministically from the same input', () => {
    const state = playingState();
    const shot = { angle: 0, power: 0.72, spin: 0.15 };

    const first = simulatePoolShot(state.balls, shot);
    const second = simulatePoolShot(state.balls, shot);

    expect(serializePoolBalls(first.balls)).toBe(serializePoolBalls(second.balls));
    expect(first.scratched).toBe(second.scratched);
  });

  it('does not let a forged all-pocketed sync define the authoritative result', () => {
    const state = playingState();
    const forged = pocket(state.balls, '1', '2', '3', '4', '5', '6');
    const authoritative = simulatePoolShot(state.balls, { angle: Math.PI / 2, power: 0.2, spin: 0 });

    expect(newlyPottedPoolBalls(state.balls, forged)).toBeGreaterThan(POOL_MAX_POTTED_PER_SHOT);
    expect(serializePoolBalls(authoritative.balls)).not.toBe(serializePoolBalls(forged));
  });
});
