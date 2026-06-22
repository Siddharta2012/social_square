import type { PoolBall } from '@social-square/shared';

export interface AimGuide {
  cueStart: { x: number; y: number };
  cueEnd: { x: number; y: number };
  ghost?: { x: number; y: number };
  targetStart?: { x: number; y: number };
  targetEnd?: { x: number; y: number };
}

export interface AimDims {
  tableW: number;
  tableH: number;
  ballR: number;
}

// Geometric aim guide: ray-cast the cue ball along the aim direction until it
// reaches the first object ball or a cushion. No spin/friction/bounce
// simulation, so the rendered line is always clean and readable (the previous
// implementation simulated the full physics with cushion bounces, which drew a
// wild zig-zagging "trajectory").
export function predictAim(balls: PoolBall[], angle: number, dims: AimDims): AimGuide | null {
  const cue = balls.find((ball) => ball.id === 'cue' && !ball.pocketed);
  if (!cue) return null;

  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const toCanvas = (x: number, y: number) => ({ x: x * dims.tableW, y: y * dims.tableH });

  // Distance until the cue-ball center reaches a cushion (same bounds the
  // physics step clamps against).
  let tWall = Infinity;
  if (dx > 1e-6) tWall = Math.min(tWall, (0.94 - cue.x) / dx);
  else if (dx < -1e-6) tWall = Math.min(tWall, (0.06 - cue.x) / dx);
  if (dy > 1e-6) tWall = Math.min(tWall, (0.91 - cue.y) / dy);
  else if (dy < -1e-6) tWall = Math.min(tWall, (0.09 - cue.y) / dy);
  if (!Number.isFinite(tWall) || tWall < 0) tWall = 0;

  // Nearest object ball the cue ball would touch (centers within 2 radii).
  const contact = dims.ballR * 2;
  let tBall = Infinity;
  let hit: PoolBall | null = null;
  for (const ball of balls) {
    if (ball.id === 'cue' || ball.pocketed) continue;
    const ex = cue.x - ball.x;
    const ey = cue.y - ball.y;
    const proj = ex * dx + ey * dy;
    const disc = proj * proj - (ex * ex + ey * ey - contact * contact);
    if (disc < 0) continue;
    const t = -proj - Math.sqrt(disc);
    if (t < 0) continue;
    if (t < tBall) {
      tBall = t;
      hit = ball;
    }
  }

  const cueStart = toCanvas(cue.x, cue.y);
  if (hit && tBall <= tWall) {
    const gx = cue.x + dx * tBall;
    const gy = cue.y + dy * tBall;
    let nx = hit.x - gx;
    let ny = hit.y - gy;
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    const reach = 0.17;
    return {
      cueStart,
      cueEnd: toCanvas(gx, gy),
      ghost: toCanvas(gx, gy),
      targetStart: toCanvas(hit.x, hit.y),
      targetEnd: toCanvas(hit.x + nx * reach, hit.y + ny * reach),
    };
  }

  return {
    cueStart,
    cueEnd: toCanvas(cue.x + dx * tWall, cue.y + dy * tWall),
  };
}
