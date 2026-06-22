import type { ObjectState, Position } from '../types/events';

export const POOL_OBJECT_ID = 'pool:bar';
export const POOL_POSITION: Position = { x: 9, y: 8 };
export const POOL_PLAY_COST = 200;
export const POOL_MAX_PLAYERS = 2;
export const POOL_PLAY_DURATION_MS = 600_000;
export const POOL_MAX_POTTED_PER_SHOT = 4;
export const POOL_BALL_RADIUS = 0.025;
export const POOL_POCKET_RADIUS = 0.055;
export const POOL_PHYSICS_FRICTION = 0.986;
export const POOL_PHYSICS_STOP_SPEED = 0.012;
export const POOL_PHYSICS_MAX_STEP = 1 / 180;
export const POOL_SHOT_IMPULSE = 1.75;
export const POOL_SPIN_CURVE = 0.42;
export const POOL_SERVER_STEP_SECONDS = 1 / 60;
export const POOL_SERVER_MAX_SIM_SECONDS = 12;

export type PoolMode = 'solo' | 'duo';
export type PoolPhase = 'idle' | 'waiting' | 'playing' | 'finished';

export interface PoolPlayer {
  userId: string;
  username: string;
  joinedAt: number;
}

export interface PoolBall {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  spin?: number;
  pocketed?: boolean;
}

export interface PoolShot {
  shotId: string;
  userId: string;
  angle: number;
  power: number;
  spin?: number;
  createdAt: number;
}

export interface PoolShotOutcome {
  userId: string;
  /** Object balls pocketed on this shot. */
  potted: number;
  /** Cue ball was pocketed (scratch). */
  scratched: boolean;
  /** The shot was a foul (currently: a scratch). */
  foul: boolean;
  illegalBreak?: boolean;
}

export interface PoolRules {
  legalBreakMinPotted: number;
  ballInHandAfterScratch: boolean;
  maxPottedPerShot: number;
}

export interface PoolState {
  kind: 'pool';
  phase: PoolPhase;
  mode: PoolMode;
  players: PoolPlayer[];
  balls: PoolBall[];
  startedAt?: number;
  expiresAt?: number;
  turnUserId?: string;
  winnerUserId?: string;
  lastShot?: PoolShot;
  message?: string;
  /** Points per player userId (object balls pocketed, minus foul penalties). */
  scores: Record<string, number>;
  /** Foul count per player userId. */
  fouls: Record<string, number>;
  /** Result of the most recent resolved shot, for HUD feedback. */
  lastOutcome?: PoolShotOutcome;
  rules: PoolRules;
  breakResolved: boolean;
  ballInHandUserId?: string;
  updatedAt: number;
}

const BALL_COLORS = [
  '#f4f7ff',
  '#ffd166',
  '#4dabf7',
  '#ff6b6b',
  '#b197fc',
  '#51cf66',
  '#ffa94d',
];

export function defaultPoolBalls(): PoolBall[] {
  return [
    { id: 'cue', x: 0.28, y: 0.5, vx: 0, vy: 0, color: BALL_COLORS[0] },
    { id: '1', x: 0.68, y: 0.5, vx: 0, vy: 0, color: BALL_COLORS[1] },
    { id: '2', x: 0.73, y: 0.46, vx: 0, vy: 0, color: BALL_COLORS[2] },
    { id: '3', x: 0.73, y: 0.54, vx: 0, vy: 0, color: BALL_COLORS[3] },
    { id: '4', x: 0.78, y: 0.42, vx: 0, vy: 0, color: BALL_COLORS[4] },
    { id: '5', x: 0.78, y: 0.5, vx: 0, vy: 0, color: BALL_COLORS[5] },
    { id: '6', x: 0.78, y: 0.58, vx: 0, vy: 0, color: BALL_COLORS[6] },
  ];
}

export function defaultPoolState(now = Date.now()): PoolState {
  return {
    kind: 'pool',
    phase: 'idle',
    mode: 'duo',
    players: [],
    balls: defaultPoolBalls(),
    scores: {},
    fouls: {},
    rules: defaultPoolRules(),
    breakResolved: false,
    updatedAt: now,
  };
}

export function defaultPoolRules(): PoolRules {
  return {
    legalBreakMinPotted: 1,
    ballInHandAfterScratch: true,
    maxPottedPerShot: POOL_MAX_POTTED_PER_SHOT,
  };
}

export function normalizePoolState(value: unknown, now = Date.now()): PoolState {
  const raw = value && typeof value === 'object' ? value as Partial<PoolState> : {};
  const phase: PoolPhase = raw.phase === 'waiting' || raw.phase === 'playing' || raw.phase === 'finished'
    ? raw.phase
    : 'idle';
  const mode: PoolMode = raw.mode === 'solo' ? 'solo' : 'duo';
  const players = normalizePoolPlayers(raw.players, now);
  const balls = normalizePoolBalls(raw.balls);
  const lastShot = normalizePoolShot(raw.lastShot);

  return {
    kind: 'pool',
    phase,
    mode,
    players,
    balls,
    startedAt: typeof raw.startedAt === 'number' && Number.isFinite(raw.startedAt) ? raw.startedAt : undefined,
    expiresAt: typeof raw.expiresAt === 'number' && Number.isFinite(raw.expiresAt) ? raw.expiresAt : undefined,
    turnUserId: typeof raw.turnUserId === 'string' ? raw.turnUserId : players[0]?.userId,
    winnerUserId: typeof raw.winnerUserId === 'string' ? raw.winnerUserId : undefined,
    lastShot,
    message: typeof raw.message === 'string' ? raw.message.slice(0, 120) : undefined,
    scores: normalizeScoreMap(raw.scores),
    fouls: normalizeScoreMap(raw.fouls),
    lastOutcome: normalizePoolOutcome(raw.lastOutcome),
    rules: normalizePoolRules(raw.rules),
    breakResolved: raw.breakResolved === true,
    ballInHandUserId: typeof raw.ballInHandUserId === 'string' ? raw.ballInHandUserId : undefined,
    updatedAt: numberOr(raw.updatedAt, now),
  };
}

function normalizePoolRules(value: unknown): PoolRules {
  const defaults = defaultPoolRules();
  if (!value || typeof value !== 'object') return defaults;
  const raw = value as Partial<PoolRules>;
  return {
    legalBreakMinPotted: Math.max(0, Math.min(3, Math.trunc(numberOr(raw.legalBreakMinPotted, defaults.legalBreakMinPotted)))),
    ballInHandAfterScratch: raw.ballInHandAfterScratch !== false,
    maxPottedPerShot: Math.max(1, Math.min(6, Math.trunc(numberOr(raw.maxPottedPerShot, defaults.maxPottedPerShot)))),
  };
}

function normalizeScoreMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof key !== 'string' || typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    out[key.slice(0, 64)] = Math.max(0, Math.min(999, Math.trunc(raw)));
  }
  return out;
}

function normalizePoolOutcome(value: unknown): PoolShotOutcome | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Partial<PoolShotOutcome>;
  if (typeof raw.userId !== 'string') return undefined;
  return {
    userId: raw.userId.slice(0, 64),
    potted: Math.max(0, Math.min(7, Math.trunc(numberOr(raw.potted, 0)))),
    scratched: raw.scratched === true,
    foul: raw.foul === true,
    illegalBreak: raw.illegalBreak === true,
  };
}

export function poolStateToObjectState(state: PoolState): ObjectState {
  return state as unknown as ObjectState;
}

export interface PoolShotResolution {
  scores: Record<string, number>;
  fouls: Record<string, number>;
  outcome: PoolShotOutcome;
  finished: boolean;
  keepTurn: boolean;
  nextTurnUserId: string | undefined;
  winnerUserId: string | undefined;
  ballInHandUserId: string | undefined;
  breakResolved: boolean;
  message: string;
}

export interface PoolPhysicsStepResult {
  balls: PoolBall[];
  scratched: boolean;
}

export interface PoolShotSimulation {
  balls: PoolBall[];
  scratched: boolean;
  steps: number;
}

/**
 * Apply traditional billiards scoring to a resolved shot. Works for both solo
 * and duo:
 *  - each object ball pocketed scores +1 for the shooter;
 *  - pocketing the cue ball (scratch) is a foul: -1 penalty and the turn passes;
 *  - potting at least one ball cleanly lets the shooter keep the table;
 *  - clearing every object ball ends the game, highest score wins.
 */
export function resolvePoolShot(
  state: PoolState,
  shooterId: string,
  settledBalls: PoolBall[],
  scratched: boolean,
): PoolShotResolution {
  const pottedThisShot = newlyPottedPoolBalls(state.balls, settledBalls);
  const remaining = settledBalls.filter((ball) => ball.id !== 'cue' && !ball.pocketed).length;
  const illegalBreak = !state.breakResolved && pottedThisShot < state.rules.legalBreakMinPotted;
  const foul = scratched || illegalBreak;

  const scores: Record<string, number> = { ...state.scores };
  scores[shooterId] = Math.max(0, (scores[shooterId] ?? 0) + pottedThisShot - (foul ? 1 : 0));

  const fouls: Record<string, number> = { ...state.fouls };
  if (foul) fouls[shooterId] = (fouls[shooterId] ?? 0) + 1;

  const finished = remaining === 0;
  const keepTurn = !finished && pottedThisShot > 0 && !scratched;
  const nextTurnUserId = finished
    ? shooterId
    : keepTurn
      ? shooterId
      : rotatePoolTurn(state, shooterId);

  const winnerUserId = finished ? poolWinnerByScore(state, scores) : state.winnerUserId;
  const ballInHandUserId = !finished && foul && state.rules.ballInHandAfterScratch ? nextTurnUserId : undefined;
  const shooterName = state.players.find((player) => player.userId === shooterId)?.username ?? 'Giocatore';

  let message: string;
  if (finished) {
    const winnerName = state.players.find((player) => player.userId === winnerUserId)?.username;
    message = state.players.length > 1 && winnerName
      ? `Tavolo libero! Vince ${winnerName}`
      : 'Tavolo libero! Partita conclusa';
  } else if (scratched) {
    message = pottedThisShot > 0
      ? `${shooterName}: fallo, bilia battente in buca (-1)`
      : `${shooterName}: fallo, bilia battente in buca`;
  } else if (illegalBreak) {
    message = `${shooterName}: apertura non valida, cambio turno`;
  } else if (pottedThisShot >= 2) {
    message = `${shooterName} imbuca ${pottedThisShot} bilie! Tira ancora`;
  } else if (pottedThisShot === 1) {
    message = `${shooterName} imbuca e tira ancora`;
  } else {
    message = state.players.length > 1 ? `${shooterName} non imbuca, cambio turno` : `${shooterName} non imbuca`;
  }

  return {
    scores,
    fouls,
    outcome: { userId: shooterId, potted: pottedThisShot, scratched, foul, illegalBreak },
    finished,
    keepTurn,
    nextTurnUserId,
    winnerUserId,
    ballInHandUserId,
    breakResolved: true,
    message,
  };
}

export function newlyPottedPoolBalls(previousBalls: readonly PoolBall[], settledBalls: readonly PoolBall[]): number {
  const wasPocketed = new Set(
    previousBalls.filter((ball) => ball.id !== 'cue' && ball.pocketed).map((ball) => ball.id),
  );
  return settledBalls.filter(
    (ball) => ball.id !== 'cue' && ball.pocketed && !wasPocketed.has(ball.id),
  ).length;
}

export function applyPoolShotImpulse(balls: readonly PoolBall[], shot: Pick<PoolShot, 'angle' | 'power' | 'spin'>): PoolBall[] {
  const next = balls.map((ball) => ({ ...ball, vx: 0, vy: 0 }));
  const cue = next.find((ball) => ball.id === 'cue');
  if (!cue || cue.pocketed) return next;
  const power = clamp(shot.power, 0, 1);
  cue.vx = Math.cos(shot.angle) * power * POOL_SHOT_IMPULSE;
  cue.vy = Math.sin(shot.angle) * power * POOL_SHOT_IMPULSE;
  cue.spin = clamp(shot.spin ?? 0, -1, 1) * power;
  return next;
}

export function stepPoolPhysics(balls: readonly PoolBall[], dt: number): PoolPhysicsStepResult {
  const next = balls.map((ball) => ({ ...ball }));
  const subSteps = Math.max(1, Math.ceil(dt / POOL_PHYSICS_MAX_STEP));
  const subDt = dt / subSteps;
  let scratched = false;

  for (let step = 0; step < subSteps; step++) {
    for (const ball of next) {
      if (ball.pocketed) continue;
      const speed = Math.hypot(ball.vx, ball.vy);
      if (ball.spin && speed > POOL_PHYSICS_STOP_SPEED) {
        const vx = ball.vx;
        const vy = ball.vy;
        const curve = ball.spin * POOL_SPIN_CURVE * subDt * Math.min(1, speed / 1.2);
        ball.vx += (-vy / speed) * curve;
        ball.vy += (vx / speed) * curve;
        ball.spin *= Math.pow(0.962, subDt * 60);
        if (Math.abs(ball.spin) < 0.006) ball.spin = 0;
      }

      ball.x += ball.vx * subDt;
      ball.y += ball.vy * subDt;
      ball.vx *= Math.pow(POOL_PHYSICS_FRICTION, subDt * 60);
      ball.vy *= Math.pow(POOL_PHYSICS_FRICTION, subDt * 60);

      if (ball.x < 0.06 || ball.x > 0.94) {
        ball.x = clamp(ball.x, 0.06, 0.94);
        ball.vx *= -0.84;
        ball.spin = -(ball.spin ?? 0) * 0.72;
      }
      if (ball.y < 0.09 || ball.y > 0.91) {
        ball.y = clamp(ball.y, 0.09, 0.91);
        ball.vy *= -0.84;
        ball.spin = -(ball.spin ?? 0) * 0.72;
      }

      for (const pocket of POOL_POCKETS) {
        if (Math.hypot(ball.x - pocket.x, ball.y - pocket.y) < POOL_POCKET_RADIUS) {
          if (ball.id === 'cue') {
            ball.x = 0.28;
            ball.y = 0.5;
            ball.vx = 0;
            ball.vy = 0;
            ball.spin = 0;
            scratched = true;
          } else {
            ball.pocketed = true;
            ball.vx = 0;
            ball.vy = 0;
            ball.spin = 0;
          }
        }
      }
    }

    for (let i = 0; i < next.length; i++) {
      for (let j = i + 1; j < next.length; j++) {
        collidePoolBalls(next[i], next[j]);
      }
    }
  }

  return { balls: next, scratched };
}

export function simulatePoolShot(
  balls: readonly PoolBall[],
  shot: Pick<PoolShot, 'angle' | 'power' | 'spin'>,
  fixedDt = POOL_SERVER_STEP_SECONDS,
  maxSeconds = POOL_SERVER_MAX_SIM_SECONDS,
): PoolShotSimulation {
  let next = applyPoolShotImpulse(balls, shot);
  let scratched = false;
  const maxSteps = Math.ceil(maxSeconds / fixedDt);
  let steps = 0;

  for (; steps < maxSteps; steps++) {
    const stepped = stepPoolPhysics(next, fixedDt);
    next = stepped.balls;
    scratched = scratched || stepped.scratched;
    if (!next.some((ball) => !ball.pocketed && Math.hypot(ball.vx, ball.vy) > POOL_PHYSICS_STOP_SPEED)) break;
  }

  return {
    balls: next.map((ball) => ({ ...ball, vx: 0, vy: 0, spin: 0 })),
    scratched,
    steps,
  };
}

function rotatePoolTurn(state: PoolState, shooterId: string): string | undefined {
  if (state.mode === 'solo' || state.players.length < 2) return shooterId;
  const index = state.players.findIndex((player) => player.userId === shooterId);
  return state.players[(index + 1) % state.players.length]?.userId ?? state.players[0]?.userId;
}

function poolWinnerByScore(state: PoolState, scores: Record<string, number>): string | undefined {
  if (state.players.length === 0) return state.winnerUserId;
  let best = state.players[0];
  for (const player of state.players) {
    if ((scores[player.userId] ?? 0) > (scores[best.userId] ?? 0)) best = player;
  }
  return best.userId;
}

const POOL_POCKETS: Position[] = [
  { x: 0.06, y: 0.09 },
  { x: 0.5, y: 0.08 },
  { x: 0.94, y: 0.09 },
  { x: 0.06, y: 0.91 },
  { x: 0.5, y: 0.92 },
  { x: 0.94, y: 0.91 },
];

function collidePoolBalls(a: PoolBall, b: PoolBall): void {
  if (a.pocketed || b.pocketed) return;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const minDist = POOL_BALL_RADIUS * 2;
  if (dist <= 0 || dist >= minDist) return;

  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = (minDist - dist) / 2;
  a.x -= nx * overlap;
  a.y -= ny * overlap;
  b.x += nx * overlap;
  b.y += ny * overlap;

  const tx = -ny;
  const ty = nx;
  const dpTanA = a.vx * tx + a.vy * ty;
  const dpTanB = b.vx * tx + b.vy * ty;
  const dpNormA = a.vx * nx + a.vy * ny;
  const dpNormB = b.vx * nx + b.vy * ny;

  a.vx = tx * dpTanA + nx * dpNormB;
  a.vy = ty * dpTanA + ny * dpNormB;
  b.vx = tx * dpTanB + nx * dpNormA;
  b.vy = ty * dpTanB + ny * dpNormA;
}

export function serializePoolBalls(balls: readonly PoolBall[]): string {
  return balls.map((ball) => [
    ball.id,
    ball.x.toFixed(4),
    ball.y.toFixed(4),
    ball.vx.toFixed(4),
    ball.vy.toFixed(4),
    ball.pocketed ? '1' : '0',
  ].join(':')).join('|');
}

export function parsePoolBalls(input: unknown): PoolBall[] | null {
  if (typeof input !== 'string' || input.length > 800) return null;
  const defaults = new Map(defaultPoolBalls().map((ball) => [ball.id, ball]));
  const balls: PoolBall[] = [];

  for (const chunk of input.split('|')) {
    const [id, rawX, rawY, rawVx, rawVy, rawPocketed] = chunk.split(':');
    const base = defaults.get(id);
    if (!base) return null;
    const x = numberOr(Number(rawX), NaN);
    const y = numberOr(Number(rawY), NaN);
    const vx = numberOr(Number(rawVx), 0);
    const vy = numberOr(Number(rawVy), 0);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    balls.push({
      ...base,
      x: clamp(x, 0.06, 0.94),
      y: clamp(y, 0.09, 0.91),
      vx: clamp(vx, -2, 2),
      vy: clamp(vy, -2, 2),
      spin: 0,
      pocketed: rawPocketed === '1',
    });
  }

  return balls.length === defaults.size ? balls : null;
}

function normalizePoolPlayers(value: unknown, now: number): PoolPlayer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): PoolPlayer[] => {
    if (!entry || typeof entry !== 'object') return [];
    const raw = entry as Partial<PoolPlayer>;
    if (typeof raw.userId !== 'string' || typeof raw.username !== 'string') return [];
    return [{
      userId: raw.userId,
      username: raw.username.slice(0, 30),
      joinedAt: numberOr(raw.joinedAt, now),
    }];
  }).slice(0, POOL_MAX_PLAYERS);
}

function normalizePoolBalls(value: unknown): PoolBall[] {
  if (!Array.isArray(value)) return defaultPoolBalls();
  const defaults = new Map(defaultPoolBalls().map((ball) => [ball.id, ball]));
  const balls = value.flatMap((entry): PoolBall[] => {
    if (!entry || typeof entry !== 'object') return [];
    const raw = entry as Partial<PoolBall>;
    if (typeof raw.id !== 'string') return [];
    const base = defaults.get(raw.id);
    if (!base) return [];
    return [{
      ...base,
      x: clamp(numberOr(raw.x, base.x), 0.06, 0.94),
      y: clamp(numberOr(raw.y, base.y), 0.09, 0.91),
      vx: clamp(numberOr(raw.vx, 0), -2, 2),
      vy: clamp(numberOr(raw.vy, 0), -2, 2),
      spin: clamp(numberOr(raw.spin, 0), -1, 1),
      pocketed: raw.pocketed === true,
    }];
  });
  return balls.length === defaults.size ? balls : defaultPoolBalls();
}

function normalizePoolShot(value: unknown): PoolShot | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Partial<PoolShot>;
  if (typeof raw.shotId !== 'string' || typeof raw.userId !== 'string') return undefined;
  return {
    shotId: raw.shotId,
    userId: raw.userId,
    angle: clamp(numberOr(raw.angle, 0), -Math.PI * 2, Math.PI * 2),
    power: clamp(numberOr(raw.power, 0), 0, 1),
    spin: clamp(numberOr(raw.spin, 0), -1, 1),
    createdAt: numberOr(raw.createdAt, Date.now()),
  };
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
