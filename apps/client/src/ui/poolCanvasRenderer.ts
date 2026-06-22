import { predictAim } from './poolAim';
import type { PoolBall } from '@social-square/shared';
import type React from 'react';

export const TABLE_W = 760;
export const TABLE_H = 380;
export const BALL_R = 0.025;

interface StrikeState {
  start: number;
  angle: number;
  power: number;
}

interface DrawPoolCanvasOptions {
  canvas: HTMLCanvasElement | null;
  balls: PoolBall[];
  aimPoint: { x: number; y: number } | null;
  canShoot: boolean;
  powerSetting: number;
  strike: StrikeState | null;
}

export function canvasPointFromPointer(event: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * TABLE_W,
    y: ((event.clientY - rect.top) / rect.height) * TABLE_H,
  };
}

export function ballToCanvas(ball: PoolBall): { x: number; y: number } {
  return { x: ball.x * TABLE_W, y: ball.y * TABLE_H };
}

export function drawPoolCanvas({
  canvas,
  balls,
  aimPoint,
  canShoot,
  powerSetting,
  strike,
}: DrawPoolCanvasOptions): void {
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return;

  ctx.clearRect(0, 0, TABLE_W, TABLE_H);
  ctx.fillStyle = '#5b351f';
  roundedRect(ctx, 0, 0, TABLE_W, TABLE_H, 20);
  ctx.fillStyle = '#136845';
  roundedRect(ctx, 34, 32, TABLE_W - 68, TABLE_H - 64, 16);
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 2;
  ctx.strokeRect(58, 56, TABLE_W - 116, TABLE_H - 112);

  for (const pocket of pockets()) {
    ctx.fillStyle = '#06120d';
    ctx.beginPath();
    ctx.arc(pocket.x, pocket.y, 18, 0, Math.PI * 2);
    ctx.fill();
  }

  drawAimAndCue(ctx, balls, aimPoint, canShoot, powerSetting, strike);
  drawBalls(ctx, balls);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function drawAimAndCue(
  ctx: CanvasRenderingContext2D,
  balls: PoolBall[],
  aimPoint: { x: number; y: number } | null,
  canShoot: boolean,
  powerSetting: number,
  striking: StrikeState | null,
): void {
  const aiming = canShoot && aimPoint !== null;
  const cue = balls.find((ball) => ball.id === 'cue' && !ball.pocketed);
  if (!cue || (!aiming && !striking)) return;

  const cuePoint = ballToCanvas(cue);
  const angle = striking
    ? striking.angle
    : Math.atan2((aimPoint?.y ?? cuePoint.y) - cuePoint.y, (aimPoint?.x ?? cuePoint.x + 1) - cuePoint.x);

  if (!striking) drawAimGuide(ctx, balls, angle);

  const restPull = 12 + clamp(powerSetting, 0.18, 1) * 42;
  let pull = restPull;
  if (striking) {
    const p = clamp((performance.now() - striking.start) / 220, 0, 1);
    const peak = restPull + 22;
    if (p < 0.3) {
      pull = restPull + (peak - restPull) * (p / 0.3);
    } else {
      const f = (p - 0.3) / 0.7;
      pull = peak + (-6 - peak) * (f * f);
    }
  }
  drawCueStick(ctx, cuePoint, angle, pull);
}

function drawAimGuide(ctx: CanvasRenderingContext2D, balls: PoolBall[], angle: number): void {
  const guide = predictAim(balls, angle, { tableW: TABLE_W, tableH: TABLE_H, ballR: BALL_R });
  if (!guide) return;

  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(255,244,208,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(guide.cueStart.x, guide.cueStart.y);
  ctx.lineTo(guide.cueEnd.x, guide.cueEnd.y);
  ctx.stroke();

  if (guide.ghost) {
    ctx.strokeStyle = 'rgba(255,255,255,0.72)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(guide.ghost.x, guide.ghost.y, 10, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (guide.targetStart && guide.targetEnd) {
    ctx.strokeStyle = 'rgba(136,255,187,0.92)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(guide.targetStart.x, guide.targetStart.y);
    ctx.lineTo(guide.targetEnd.x, guide.targetEnd.y);
    ctx.stroke();
  }
}

function drawBalls(ctx: CanvasRenderingContext2D, balls: PoolBall[]): void {
  for (const ball of balls) {
    if (ball.pocketed) continue;
    const point = ballToCanvas(ball);
    ctx.fillStyle = 'rgba(0,0,0,0.24)';
    ctx.beginPath();
    ctx.ellipse(point.x + 3, point.y + 5, 13, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ball.color;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (ball.id !== 'cue') {
      ctx.fillStyle = '#141414';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ball.id, point.x, point.y + 0.5);
    }
  }
}

function drawCueStick(
  ctx: CanvasRenderingContext2D,
  cuePoint: { x: number; y: number },
  angle: number,
  pull: number,
): void {
  const ballR = 10;
  const backX = -Math.cos(angle);
  const backY = -Math.sin(angle);
  const tipX = cuePoint.x + backX * (ballR + pull);
  const tipY = cuePoint.y + backY * (ballR + pull);
  const shaftLen = 232;
  const buttX = tipX + backX * shaftLen;
  const buttY = tipY + backY * shaftLen;

  ctx.save();
  ctx.lineCap = 'round';

  const grad = ctx.createLinearGradient(tipX, tipY, buttX, buttY);
  grad.addColorStop(0, '#d9a86a');
  grad.addColorStop(1, '#6b4a2a');
  ctx.strokeStyle = grad;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(buttX, buttY);
  ctx.stroke();

  ctx.strokeStyle = '#efe9d6';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX + backX * 14, tipY + backY * 14);
  ctx.stroke();

  ctx.fillStyle = '#2f7fbf';
  ctx.beginPath();
  ctx.arc(tipX, tipY, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function pockets(): Array<{ x: number; y: number }> {
  return [
    { x: 42, y: 40 },
    { x: TABLE_W / 2, y: 34 },
    { x: TABLE_W - 42, y: 40 },
    { x: 42, y: TABLE_H - 40 },
    { x: TABLE_W / 2, y: TABLE_H - 34 },
    { x: TABLE_W - 42, y: TABLE_H - 40 },
  ];
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}
