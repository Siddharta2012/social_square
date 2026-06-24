import {
  POOL_PLAY_DURATION_MS,
  POOL_PLAY_COST,
  POOL_PHYSICS_STOP_SPEED,
  applyPoolShotImpulse,
  defaultPoolBalls,
  normalizePoolState,
  stepPoolPhysics,
  type PoolBall,
  type PoolShot,
} from '@social-square/shared';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { eventBus } from '../eventBus';
import { t } from '../i18n';
import { useGameStore } from '../store/gameStore';
import { useUserStore } from '../store/userStore';
import {
  TABLE_H,
  TABLE_W,
  ballToCanvas,
  canvasPointFromPointer,
  clamp,
  drawPoolCanvas,
} from './poolCanvasRenderer';
import { PoolOverlayView } from './PoolOverlayView';

interface PoolOverlayProps {
  isCompact: boolean;
}

export const PoolOverlay: React.FC<PoolOverlayProps> = ({ isCompact }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const ballsRef = useRef<PoolBall[]>(defaultPoolBalls());
  const processedShotRef = useRef<string | null>(null);
  const syncingShotRef = useRef<string | null>(null);
  const strikeRef = useRef<{ start: number; angle: number; power: number } | null>(null);
  const strikeRafRef = useRef<number | null>(null);
  const poolStatus = useGameStore((s) => s.poolStatus);
  const setShowPoolOverlay = useGameStore((s) => s.setShowPoolOverlay);
  const poolMessage = useGameStore((s) => s.poolMessage);
  const setPoolMessage = useGameStore((s) => s.setPoolMessage);
  const petals = useGameStore((s) => s.petals);
  const actionAvailability = useGameStore((s) => s.actionAvailability);
  const userId = useUserStore((s) => s.userId);
  const pool = useMemo(() => normalizePoolState(poolStatus), [poolStatus]);
  const [balls, setBalls] = useState<PoolBall[]>(pool.balls);
  const [aimPoint, setAimPoint] = useState<{ x: number; y: number } | null>(null);
  const [powerSetting, setPowerSetting] = useState(0.58);
  const [spinSetting, setSpinSetting] = useState(0);
  const [moving, setMoving] = useState(false);
  const [clockNow, setClockNow] = useState(Date.now());
  const prefersReducedMotion = useMemo(() => (
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  ), []);

  const me = pool.players.find((player) => player.userId === userId);
  const isPlayer = Boolean(me);
  const canPay = petals >= POOL_PLAY_COST;
  const poolActive = pool.phase === 'waiting' || pool.phase === 'playing';
  const poolSecondsLeft = pool.expiresAt && poolActive
    ? Math.max(0, Math.ceil((pool.expiresAt - clockNow) / 1000))
    : 0;
  const poolTimeLeft = poolSecondsLeft > 0
    ? `${Math.floor(poolSecondsLeft / 60)}:${String(poolSecondsLeft % 60).padStart(2, '0')}`
    : '';
  const poolExpired = poolActive && pool.expiresAt !== undefined && poolSecondsLeft <= 0;
  const myTurn = pool.phase === 'playing' && isPlayer && (!pool.turnUserId || pool.turnUserId === userId);
  const canPlaceCue = myTurn && pool.ballInHandUserId === userId && !moving && !poolExpired;
  const canShoot = myTurn && !moving && !poolExpired && !canPlaceCue;
  const inlineMessage = poolMessage ?? (poolExpired
    ? { text: t('pool.expired'), tone: 'error' as const }
    : canPlaceCue
      ? { text: t('pool.placeCue'), tone: 'info' as const }
    : !canPay
    ? { text: t('pool.notEnoughStart', { cost: POOL_PLAY_COST }), tone: 'error' as const }
    : !actionAvailability.nearPool
      ? { text: t('pool.stayNear'), tone: 'info' as const }
      : null);

  useEffect(() => {
    if (pool.lastShot?.shotId && pool.lastShot.shotId !== processedShotRef.current) {
      processedShotRef.current = pool.lastShot.shotId;
      syncingShotRef.current = pool.lastShot.userId === userId ? pool.lastShot.shotId : null;
      applyShot(pool.lastShot);
      return;
    }

    if (!moving) {
      const nextBalls = pool.balls.map((ball) => ({ ...ball }));
      ballsRef.current = nextBalls;
      setBalls(nextBalls);
    }
  }, [pool.updatedAt, pool.lastShot?.shotId]);

  useEffect(() => {
    draw();
  }, [balls, aimPoint, powerSetting, spinSetting, pool.phase, myTurn, poolSecondsLeft]);

  useEffect(() => {
    if (!poolActive) return undefined;
    const timer = window.setInterval(() => setClockNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [poolActive, pool.expiresAt]);

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (strikeRafRef.current !== null) cancelAnimationFrame(strikeRafRef.current);
  }, []);

  const panelStyle: React.CSSProperties = {
    width: isCompact ? 'calc(100vw - 16px)' : 'min(980px, calc(100vw - 48px))',
    maxHeight: isCompact ? 'calc(100vh - 34px)' : 'calc(100vh - 72px)',
    overflow: 'auto',
    background: 'rgba(8,10,24,0.96)',
    border: '1px solid rgba(120,255,190,0.34)',
    borderRadius: '8px',
    padding: isCompact ? '10px' : '14px',
    boxShadow: '0 24px 60px rgba(0,0,0,0.48)',
  };

  const buttonStyle: React.CSSProperties = {
    background: 'rgba(120,255,190,0.1)',
    border: '1px solid rgba(120,255,190,0.38)',
    color: '#bfffe4',
    fontFamily: 'monospace',
    fontSize: '12px',
    minHeight: '34px',
    padding: '0 12px',
    borderRadius: '5px',
    cursor: 'pointer',
  };

  const disabledStyle: React.CSSProperties = {
    opacity: 0.52,
  };

  const playersLabel = pool.players.length === 0
    ? t('pool.noPlayers')
    : pool.players.map((player) => player.username).join(' vs ');
  const winnerName = pool.winnerUserId
    ? pool.players.find((player) => player.userId === pool.winnerUserId)?.username
    : null;

  const showScoreboard = pool.players.length > 0 && (pool.phase === 'playing' || pool.phase === 'finished');
  const scoreboard = pool.players.map((player) => ({
    userId: player.userId,
    username: player.username,
    score: pool.scores[player.userId] ?? 0,
    fouls: pool.fouls[player.userId] ?? 0,
    isTurn: pool.phase === 'playing' && pool.turnUserId === player.userId,
    isWinner: pool.phase === 'finished' && pool.winnerUserId === player.userId,
  }));
  const ballsRemaining = pool.balls.filter((ball) => ball.id !== 'cue' && !ball.pocketed).length;
  const spinDirection = t(spinSetting < -0.04
    ? 'pool.spin.left'
    : spinSetting > 0.04
      ? 'pool.spin.right'
      : 'pool.spin.neutral');

  const turnLabel = pool.phase === 'playing'
    ? pool.turnUserId === userId
      ? t('pool.you')
      : t('pool.turnOf', { username: pool.players.find((player) => player.userId === pool.turnUserId)?.username ?? t('pool.opponent') })
    : pool.phase === 'waiting'
      ? t('pool.waitingOpponent')
      : pool.phase === 'finished'
        ? winnerName ? t('pool.winner', { username: winnerName }) : t('pool.finished')
        : t('pool.chooseMode');
  const durationMinutes = Math.round(POOL_PLAY_DURATION_MS / 60_000);

  return (
    <PoolOverlayView
      isCompact={isCompact}
      panelStyle={panelStyle}
      buttonStyle={buttonStyle}
      disabledStyle={disabledStyle}
      playersLabel={playersLabel}
      turnLabel={turnLabel}
      poolActive={poolActive}
      poolExpired={poolExpired}
      poolTimeLeft={poolTimeLeft}
      isPlayer={isPlayer}
      inlineMessage={inlineMessage}
      showScoreboard={showScoreboard}
      scoreboard={scoreboard}
      pool={pool}
      ballsRemaining={ballsRemaining}
      canPay={canPay}
      durationMinutes={durationMinutes}
      canvasRef={canvasRef}
      canPlaceCue={canPlaceCue}
      canShoot={canShoot}
      powerSetting={powerSetting}
      setPowerSetting={setPowerSetting}
      spinSetting={spinSetting}
      setSpinSetting={setSpinSetting}
      spinDirection={spinDirection}
      petals={petals}
      hidePoolOverlay={hidePoolOverlay}
      requestPoolAction={requestPoolAction}
      handlePointerDown={handlePointerDown}
      handlePointerMove={handlePointerMove}
      handlePointerUp={handlePointerUp}
      shootCurrentAim={shootCurrentAim}
    />
  );

  function hidePoolOverlay(): void {
    setPoolMessage(null);
    setShowPoolOverlay(false);
  }

  function requestPoolAction(action: 'pool-start-solo' | 'pool-create-duo' | 'pool-join-duo'): void {
    if (petals < POOL_PLAY_COST) {
      setPoolMessage({ text: t('pool.notEnoughStart', { cost: POOL_PLAY_COST }), tone: 'error' });
      return;
    }
    setPoolMessage({ text: t('pool.pending'), tone: 'info' });
    eventBus.emit(action);
  }

  function applyShot(shot: PoolShot): void {
    if (strikeRafRef.current !== null) cancelAnimationFrame(strikeRafRef.current);
    strikeRafRef.current = null;
    strikeRef.current = null;
    startSimulation(applyPoolShotImpulse(ballsRef.current, shot));
  }

  function startSimulation(initialBalls: PoolBall[]): void {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    ballsRef.current = initialBalls;
    setMoving(true);
    let last = performance.now();
    let scratched = false;

    const tick = (now: number) => {
      const dt = Math.min(0.026, (now - last) / 1000);
      last = now;
      const stepped = stepPoolPhysics(ballsRef.current, dt);
      const next = stepped.balls;
      if (stepped.scratched) scratched = true;
      ballsRef.current = next;
      setBalls(next.map((ball) => ({ ...ball })));
      draw(next);

      if (next.some((ball) => !ball.pocketed && Math.hypot(ball.vx, ball.vy) > POOL_PHYSICS_STOP_SPEED)) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      rafRef.current = null;
      const settled = next.map((ball) => ({ ...ball, vx: 0, vy: 0, spin: 0 }));
      ballsRef.current = settled;
      setBalls(settled);
      setMoving(false);
      if (syncingShotRef.current) {
        syncingShotRef.current = null;
        eventBus.emit('pool-sync', { balls: settled, scratched });
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (canPlaceCue) {
      placeCueBall(canvasPointFromPointer(event));
      return;
    }
    if (!canShoot) return;
    setAimPoint(canvasPointFromPointer(event));
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (!canShoot || event.buttons !== 1) return;
    setAimPoint(canvasPointFromPointer(event));
  }

  function handlePointerUp(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (!canShoot) return;
    setAimPoint(canvasPointFromPointer(event));
  }

  function shootCurrentAim(): void {
    if (!canShoot) return;
    const shot = shotFromAim();
    if (!shot) return;
    if (!prefersReducedMotion) triggerCueStrike(shot.angle, shot.power);
    setAimPoint(null);
    eventBus.emit('pool-shot', {
      angle: shot.angle,
      power: shot.power,
      spin: shot.spin,
    });
  }

  function placeCueBall(point: { x: number; y: number }): void {
    const x = clamp(point.x / TABLE_W, 0.12, 0.88);
    const y = clamp(point.y / TABLE_H, 0.14, 0.86);
    const nextBalls = ballsRef.current.map((ball) => (ball.id === 'cue'
      ? { ...ball, x, y, vx: 0, vy: 0, spin: 0, pocketed: false }
      : ball));
    ballsRef.current = nextBalls;
    setBalls(nextBalls);
    setAimPoint(null);
    eventBus.emit('pool-place-cue', { x, y });
  }

  // Lunge the cue stick into the ball for tactile feedback while we wait for the
  // server to echo the authoritative shot (which then starts the real simulation).
  function triggerCueStrike(angle: number, power: number): void {
    if (strikeRafRef.current !== null) cancelAnimationFrame(strikeRafRef.current);
    strikeRef.current = { start: performance.now(), angle, power };
    const STRIKE_MS = 220;
    const animate = (now: number) => {
      if (!strikeRef.current) {
        strikeRafRef.current = null;
        return;
      }
      draw();
      if (now - strikeRef.current.start >= STRIKE_MS) {
        strikeRef.current = null;
        strikeRafRef.current = null;
        draw();
        return;
      }
      strikeRafRef.current = requestAnimationFrame(animate);
    };
    strikeRafRef.current = requestAnimationFrame(animate);
  }

  function shotFromAim(): { angle: number; power: number; spin: number } | null {
    const cue = ballsRef.current.find((ball) => ball.id === 'cue' && !ball.pocketed);
    if (!cue) return null;
    const cuePoint = ballToCanvas(cue);
    const target = aimPoint ?? { x: cuePoint.x + 140, y: cuePoint.y };
    const dx = target.x - cuePoint.x;
    const dy = target.y - cuePoint.y;
    if (Math.hypot(dx, dy) < 10) return null;
    return {
      angle: Math.atan2(dy, dx),
      power: clamp(powerSetting, 0.18, 1),
      spin: clamp(spinSetting, -1, 1),
    };
  }

  function draw(sourceBalls = ballsRef.current): void {
    drawPoolCanvas({
      canvas: canvasRef.current,
      balls: sourceBalls,
      aimPoint,
      canShoot,
      powerSetting,
      strike: strikeRef.current,
    });
  }

};
