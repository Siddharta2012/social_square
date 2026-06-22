import {
  defaultPoolBalls,
  normalizePoolState,
  resolvePoolShot,
  type PoolBall,
  type PoolState,
} from '@social-square/shared';
import { describe, expect, it } from 'vitest';

function playingState(overrides: Partial<PoolState> = {}): PoolState {
  return normalizePoolState({
    phase: 'playing',
    mode: 'solo',
    players: [{ userId: 'a', username: 'Ada', joinedAt: 0 }],
    balls: defaultPoolBalls(),
    turnUserId: 'a',
    ...overrides,
  }, 1000);
}

function pocket(balls: PoolBall[], ...ids: string[]): PoolBall[] {
  const set = new Set(ids);
  return balls.map((ball) => (set.has(ball.id) ? { ...ball, pocketed: true } : ball));
}

describe('resolvePoolShot', () => {
  it('scores a clean pot and keeps the turn for the shooter', () => {
    const state = playingState();
    const res = resolvePoolShot(state, 'a', pocket(state.balls, '1'), false);
    expect(res.outcome.potted).toBe(1);
    expect(res.scores.a).toBe(1);
    expect(res.keepTurn).toBe(true);
    expect(res.nextTurnUserId).toBe('a');
    expect(res.finished).toBe(false);
  });

  it('treats a scratch as a foul with a penalty and passes the turn in duo', () => {
    const state = playingState({
      mode: 'duo',
      players: [
        { userId: 'a', username: 'Ada', joinedAt: 0 },
        { userId: 'b', username: 'Bo', joinedAt: 0 },
      ],
      scores: { a: 2 },
    });
    const res = resolvePoolShot(state, 'a', state.balls, true);
    expect(res.outcome.scratched).toBe(true);
    expect(res.outcome.foul).toBe(true);
    expect(res.fouls.a).toBe(1);
    expect(res.scores.a).toBe(1); // 2 + 0 potted - 1 penalty
    expect(res.nextTurnUserId).toBe('b');
  });

  it('passes the turn after a dry shot (no pot, no scratch) in duo', () => {
    const state = playingState({
      mode: 'duo',
      players: [
        { userId: 'a', username: 'Ada', joinedAt: 0 },
        { userId: 'b', username: 'Bo', joinedAt: 0 },
      ],
    });
    const res = resolvePoolShot(state, 'a', state.balls, false);
    expect(res.outcome.potted).toBe(0);
    expect(res.keepTurn).toBe(false);
    expect(res.nextTurnUserId).toBe('b');
  });

  it('keeps the same shooter on a dry shot in solo', () => {
    const state = playingState();
    const res = resolvePoolShot(state, 'a', state.balls, false);
    expect(res.nextTurnUserId).toBe('a');
    expect(res.finished).toBe(false);
  });

  it('finishes the game when the last object ball is potted', () => {
    const state = playingState({ balls: pocket(defaultPoolBalls(), '1', '2', '3', '4', '5', '6'), scores: { a: 6 } });
    const cleared = pocket(state.balls, '1', '2', '3', '4', '5', '6');
    const res = resolvePoolShot(state, 'a', cleared, false);
    expect(res.finished).toBe(true);
    expect(res.winnerUserId).toBe('a');
    expect(res.message).toContain('Tavolo libero');
  });

  it('only counts balls newly pocketed on this shot', () => {
    const state = playingState({ balls: pocket(defaultPoolBalls(), '1') });
    // Ball 1 was already down; this shot pots ball 2 only.
    const res = resolvePoolShot(state, 'a', pocket(state.balls, '2'), false);
    expect(res.outcome.potted).toBe(1);
  });
});
