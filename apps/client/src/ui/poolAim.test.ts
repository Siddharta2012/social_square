import { defaultPoolBalls, type PoolBall } from '@social-square/shared';
import { describe, expect, it } from 'vitest';
import { predictAim } from './poolAim';

const DIMS = { tableW: 760, tableH: 380, ballR: 0.025 };

describe('predictAim', () => {
  it('stops the cue line at the first object ball, not at the cushion', () => {
    // Cue at 0.28 aiming straight right hits the rack ball at 0.68 first.
    const guide = predictAim(defaultPoolBalls(), 0, DIMS);
    expect(guide).not.toBeNull();
    expect(guide!.ghost).toBeDefined();
    // Ghost ball sits two radii before the object ball (0.68 - 0.05 = 0.63).
    expect(guide!.ghost!.x / DIMS.tableW).toBeCloseTo(0.63, 3);
    // The guide must stop well before the right cushion (0.94).
    expect(guide!.cueEnd.x / DIMS.tableW).toBeLessThan(0.7);
  });

  it('points the struck ball away from the contact, roughly along the aim', () => {
    const guide = predictAim(defaultPoolBalls(), 0, DIMS);
    const target = guide!.targetStart!;
    const end = guide!.targetEnd!;
    // A dead-center hit sends the object ball forward (increasing x).
    expect(end.x).toBeGreaterThan(target.x);
    expect(Math.abs(end.y - target.y)).toBeLessThan(1);
  });

  it('runs to the cushion when nothing is in the path', () => {
    const cueOnly: PoolBall[] = [
      { id: 'cue', x: 0.5, y: 0.5, vx: 0, vy: 0, color: '#fff' },
    ];
    const guide = predictAim(cueOnly, 0, DIMS);
    expect(guide).not.toBeNull();
    expect(guide!.ghost).toBeUndefined();
    // Aiming right with no obstacles, the line ends at the right cushion bound.
    expect(guide!.cueEnd.x / DIMS.tableW).toBeCloseTo(0.94, 3);
  });

  it('ignores pocketed balls when ray-casting', () => {
    const balls = defaultPoolBalls().map((ball) =>
      ball.id === '1' ? { ...ball, pocketed: true } : ball,
    );
    const guide = predictAim(balls, 0, DIMS);
    // Ball "1" (0.68) is pocketed, so the cue should reach ball "2"/etc further on
    // or the cushion — never collide with the pocketed one at 0.63.
    if (guide!.ghost) {
      expect(guide!.ghost.x / DIMS.tableW).toBeGreaterThan(0.63 + 0.001);
    }
  });

  it('returns null when the cue ball is gone', () => {
    const noCue: PoolBall[] = [
      { id: '1', x: 0.6, y: 0.5, vx: 0, vy: 0, color: '#fff' },
    ];
    expect(predictAim(noCue, 0, DIMS)).toBeNull();
  });
});
