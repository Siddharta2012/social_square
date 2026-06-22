import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  POOL_PLAY_DURATION_MS,
  POOL_PLAY_COST,
  defaultPoolBalls,
  normalizePoolState,
  type PoolBall,
  type PoolShot,
} from '@social-square/shared';
import { eventBus } from '../eventBus';
import { useGameStore } from '../store/gameStore';
import { useUserStore } from '../store/userStore';
import { predictAim } from './poolAim';

interface PoolOverlayProps {
  isCompact: boolean;
}

const TABLE_W = 760;
const TABLE_H = 380;
const BALL_R = 0.025;
const POCKET_R = 0.055;
const FRICTION = 0.986;
const STOP_SPEED = 0.012;
const MAX_PHYSICS_STEP = 1 / 180;
const SHOT_IMPULSE = 1.75;
const SPIN_CURVE = 0.42;

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
  const canShoot = myTurn && !moving && !poolExpired;
  const inlineMessage = poolMessage ?? (poolExpired
    ? { text: 'Tempo biliardo scaduto', tone: 'error' as const }
    : !canPay
    ? { text: `Servono ${POOL_PLAY_COST} petali per iniziare`, tone: 'error' as const }
    : !actionAvailability.nearPool
      ? { text: 'Resta vicino al biliardo per avviare una partita', tone: 'info' as const }
      : null);

  useEffect(() => {
    if (pool.lastShot?.shotId && pool.lastShot.shotId !== processedShotRef.current) {
      processedShotRef.current = pool.lastShot.shotId;
      syncingShotRef.current = pool.lastShot.userId === userId ? pool.lastShot.shotId : null;
      const nextBalls = pool.balls.map((ball) => ({ ...ball }));
      ballsRef.current = nextBalls;
      setBalls(nextBalls);
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
    ? 'Nessun giocatore'
    : pool.players.map((player) => player.username).join(' vs ');
  const winnerName = pool.winnerUserId
    ? pool.players.find((player) => player.userId === pool.winnerUserId)?.username
    : null;

  const turnLabel = pool.phase === 'playing'
    ? pool.turnUserId === userId
      ? 'Tocca a te'
      : `Turno di ${pool.players.find((player) => player.userId === pool.turnUserId)?.username ?? 'avversario'}`
    : pool.phase === 'waiting'
      ? 'In attesa del secondo giocatore'
      : pool.phase === 'finished'
        ? winnerName ? `Vince ${winnerName}` : 'Partita conclusa'
        : 'Scegli una modalita';
  const durationMinutes = Math.round(POOL_PLAY_DURATION_MS / 60_000);

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      zIndex: 146,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(2,5,10,0.58)',
      pointerEvents: 'auto',
      fontFamily: 'monospace',
    }}>
      <div style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '10px' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: '#fff4d0', fontSize: '15px', fontWeight: 700 }}>Biliardo Bar Bora</div>
            <div style={{ color: '#88caae', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {playersLabel} - {turnLabel}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '7px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {poolActive && (
              <div style={{
                minWidth: '64px',
                textAlign: 'center',
                color: poolExpired ? '#ffd3ca' : '#fff4d0',
                background: poolExpired ? 'rgba(255,105,91,0.14)' : 'rgba(255,244,208,0.08)',
                border: poolExpired ? '1px solid rgba(255,105,91,0.38)' : '1px solid rgba(255,244,208,0.26)',
                borderRadius: '5px',
                padding: '6px 8px',
                fontWeight: 700,
                fontSize: '12px',
              }}>
                {poolTimeLeft || '0:00'}
              </div>
            )}
            {isPlayer && (
              <button type="button" style={buttonStyle} onClick={() => eventBus.emit('pool-leave')}>
                Esci partita
              </button>
            )}
            <button type="button" style={buttonStyle} onClick={hidePoolOverlay}>
              Nascondi
            </button>
          </div>
        </div>

        {inlineMessage && (
          <div
            role="status"
            style={{
              marginBottom: '10px',
              color: inlineMessage.tone === 'error' ? '#ffd3ca' : '#dfffee',
              background: inlineMessage.tone === 'error' ? 'rgba(255,105,91,0.12)' : 'rgba(120,255,190,0.08)',
              border: inlineMessage.tone === 'error' ? '1px solid rgba(255,105,91,0.32)' : '1px solid rgba(120,255,190,0.22)',
              borderRadius: '6px',
              padding: '8px 10px',
              fontSize: '12px',
              lineHeight: 1.35,
            }}
          >
            {inlineMessage.text}
          </div>
        )}

        {(pool.phase === 'idle' || pool.phase === 'finished' || pool.players.length === 0) && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: isCompact ? '1fr' : '1fr 1fr',
            gap: '10px',
            marginBottom: '12px',
          }}>
            <button
              type="button"
              style={{ ...buttonStyle, height: '74px', textAlign: 'left', ...(!canPay ? disabledStyle : {}) }}
              aria-disabled={!canPay}
              onClick={() => requestPoolAction('pool-start-solo')}
            >
              <strong>Gioca solo</strong>
              <br />
              {durationMinutes} min - {POOL_PLAY_COST} petali
            </button>
            <button
              type="button"
              style={{ ...buttonStyle, height: '74px', textAlign: 'left', ...(!canPay ? disabledStyle : {}) }}
              aria-disabled={!canPay}
              onClick={() => requestPoolAction('pool-create-duo')}
            >
              <strong>Crea tavolo a due</strong>
              <br />
              {durationMinutes} min - {POOL_PLAY_COST} petali a testa
            </button>
          </div>
        )}

        {pool.phase === 'waiting' && (
          <div style={{
            marginBottom: '12px',
            display: 'grid',
            gridTemplateColumns: isCompact ? '1fr' : '1fr auto',
            gap: '10px',
            alignItems: 'center',
            color: '#dfffee',
            background: 'rgba(120,255,190,0.06)',
            border: '1px solid rgba(120,255,190,0.18)',
            borderRadius: '6px',
            padding: '10px',
          }}>
            <div>
              <div style={{ color: '#fff4d0', fontWeight: 700 }}>Stanza in attesa</div>
              <div style={{ color: '#88caae', fontSize: '11px', marginTop: '3px' }}>
                {pool.players[0]?.username ?? 'Qualcuno'} ha pagato. Il secondo entra con {POOL_PLAY_COST} petali per {durationMinutes} min.
              </div>
            </div>
            {!isPlayer && (
              <button
                type="button"
                style={{ ...buttonStyle, ...(!canPay ? disabledStyle : {}) }}
                aria-disabled={!canPay}
                onClick={() => requestPoolAction('pool-join-duo')}
              >
                Entra - {POOL_PLAY_COST}
              </button>
            )}
          </div>
        )}

        <canvas
          ref={canvasRef}
          width={TABLE_W}
          height={TABLE_H}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{
            width: '100%',
            maxWidth: `${TABLE_W}px`,
            aspectRatio: `${TABLE_W} / ${TABLE_H}`,
            display: 'block',
            margin: '0 auto',
            borderRadius: '7px',
            border: '1px solid rgba(120,255,190,0.28)',
            touchAction: 'none',
            cursor: canShoot ? 'crosshair' : 'default',
            background: '#123826',
          }}
        />

        {isPlayer && pool.phase === 'playing' && (
          <div style={{
            marginTop: '10px',
            display: 'grid',
            gridTemplateColumns: isCompact ? '1fr' : '1.2fr 1.2fr auto',
            gap: '10px',
            alignItems: 'center',
            color: '#dfffee',
            background: 'rgba(120,255,190,0.06)',
            border: '1px solid rgba(120,255,190,0.16)',
            borderRadius: '6px',
            padding: '10px',
          }}>
            <label style={{ display: 'grid', gap: '5px', fontSize: '11px', color: '#88caae' }}>
              <span>Forza {Math.round(powerSetting * 100)}%</span>
              <input
                type="range"
                min="0.18"
                max="1"
                step="0.01"
                value={powerSetting}
                onChange={(event) => setPowerSetting(Number(event.currentTarget.value))}
                style={{ width: '100%' }}
              />
            </label>
            <label style={{ display: 'grid', gap: '5px', fontSize: '11px', color: '#88caae' }}>
              <span>Effetto {spinSetting < -0.04 ? 'sinistra' : spinSetting > 0.04 ? 'destra' : 'neutro'}</span>
              <input
                type="range"
                min="-1"
                max="1"
                step="0.02"
                value={spinSetting}
                onChange={(event) => setSpinSetting(Number(event.currentTarget.value))}
                style={{ width: '100%' }}
              />
            </label>
            <button
              type="button"
              style={{
                ...buttonStyle,
                minWidth: isCompact ? '100%' : '92px',
                height: '42px',
                fontWeight: 700,
                ...(!canShoot ? disabledStyle : {}),
              }}
              disabled={!canShoot}
              onClick={shootCurrentAim}
            >
              Tira
            </button>
          </div>
        )}

        <div style={{
          marginTop: '9px',
          display: 'flex',
          justifyContent: 'space-between',
          gap: '8px',
          color: '#88caae',
          fontSize: '11px',
        }}>
          <span>{canShoot ? 'Mira pronta' : turnLabel}</span>
          <span>Petali {petals}</span>
        </div>
      </div>
    </div>
  );

  function hidePoolOverlay(): void {
    setPoolMessage(null);
    setShowPoolOverlay(false);
  }

  function requestPoolAction(action: 'pool-start-solo' | 'pool-create-duo' | 'pool-join-duo'): void {
    if (petals < POOL_PLAY_COST) {
      setPoolMessage({ text: `Servono ${POOL_PLAY_COST} petali per iniziare`, tone: 'error' });
      return;
    }
    setPoolMessage({ text: 'Richiesta inviata al tavolo...', tone: 'info' });
    eventBus.emit(action);
  }

  function applyShot(shot: PoolShot): void {
    if (strikeRafRef.current !== null) cancelAnimationFrame(strikeRafRef.current);
    strikeRafRef.current = null;
    strikeRef.current = null;
    const next = ballsRef.current.map((ball) => ({ ...ball, vx: 0, vy: 0 }));
    const cue = next.find((ball) => ball.id === 'cue');
    if (!cue || cue.pocketed) return;
    cue.vx = Math.cos(shot.angle) * shot.power * SHOT_IMPULSE;
    cue.vy = Math.sin(shot.angle) * shot.power * SHOT_IMPULSE;
    cue.spin = clamp(shot.spin ?? 0, -1, 1) * shot.power;
    startSimulation(next);
  }

  function startSimulation(initialBalls: PoolBall[]): void {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    ballsRef.current = initialBalls;
    setMoving(true);
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.026, (now - last) / 1000);
      last = now;
      const next = stepPhysics(ballsRef.current, dt);
      ballsRef.current = next;
      setBalls(next.map((ball) => ({ ...ball })));
      draw(next);

      if (next.some((ball) => !ball.pocketed && Math.hypot(ball.vx, ball.vy) > STOP_SPEED)) {
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
        eventBus.emit('pool-sync', settled);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (!canShoot) return;
    setAimPoint(canvasPoint(event));
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (!canShoot || event.buttons !== 1) return;
    setAimPoint(canvasPoint(event));
  }

  function handlePointerUp(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (!canShoot) return;
    setAimPoint(canvasPoint(event));
  }

  function shootCurrentAim(): void {
    if (!canShoot) return;
    const shot = shotFromAim();
    if (!shot) return;
    triggerCueStrike(shot.angle, shot.power);
    setAimPoint(null);
    eventBus.emit('pool-shot', {
      angle: shot.angle,
      power: shot.power,
      spin: shot.spin,
    });
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

  function canvasPoint(event: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * TABLE_W,
      y: ((event.clientY - rect.top) / rect.height) * TABLE_H,
    };
  }

  function ballToCanvas(ball: PoolBall): { x: number; y: number } {
    return { x: ball.x * TABLE_W, y: ball.y * TABLE_H };
  }

  function draw(sourceBalls = ballsRef.current): void {
    const canvas = canvasRef.current;
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

    const striking = strikeRef.current;
    const cue = sourceBalls.find((ball) => ball.id === 'cue' && !ball.pocketed);
    if (cue && (canShoot || striking)) {
      const cuePoint = ballToCanvas(cue);
      let angle: number;
      if (striking) {
        angle = striking.angle;
      } else {
        const target = aimPoint ?? { x: Math.min(TABLE_W - 64, cuePoint.x + 150), y: cuePoint.y };
        angle = Math.atan2(target.y - cuePoint.y, target.x - cuePoint.x);
      }

      // Clean geometric aim guide: straight line to the first contact (ball or
      // cushion), a ghost ball at impact, and the struck ball's resulting line.
      if (!striking) {
        const guide = predictAim(sourceBalls, angle, { tableW: TABLE_W, tableH: TABLE_H, ballR: BALL_R });
        if (guide) {
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
      }

      // Cue stick: rests behind the ball (pulled back with power) and lunges in
      // when the shot fires.
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

    for (const ball of sourceBalls) {
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
};

function stepPhysics(balls: PoolBall[], dt: number): PoolBall[] {
  const next = balls.map((ball) => ({ ...ball }));
  const subSteps = Math.max(1, Math.ceil(dt / MAX_PHYSICS_STEP));
  const subDt = dt / subSteps;

  for (let step = 0; step < subSteps; step++) {
    for (const ball of next) {
      if (ball.pocketed) continue;
      const speed = Math.hypot(ball.vx, ball.vy);
      if (ball.spin && speed > STOP_SPEED) {
        const vx = ball.vx;
        const vy = ball.vy;
        const curve = ball.spin * SPIN_CURVE * subDt * Math.min(1, speed / 1.2);
        ball.vx += (-vy / speed) * curve;
        ball.vy += (vx / speed) * curve;
        ball.spin *= Math.pow(0.962, subDt * 60);
        if (Math.abs(ball.spin) < 0.006) ball.spin = 0;
      }

      ball.x += ball.vx * subDt;
      ball.y += ball.vy * subDt;
      ball.vx *= Math.pow(FRICTION, subDt * 60);
      ball.vy *= Math.pow(FRICTION, subDt * 60);

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

      for (const pocket of [
        { x: 0.06, y: 0.09 },
        { x: 0.5, y: 0.08 },
        { x: 0.94, y: 0.09 },
        { x: 0.06, y: 0.91 },
        { x: 0.5, y: 0.92 },
        { x: 0.94, y: 0.91 },
      ]) {
        if (Math.hypot(ball.x - pocket.x, ball.y - pocket.y) < POCKET_R) {
          if (ball.id === 'cue') {
            ball.x = 0.28;
            ball.y = 0.5;
            ball.vx = 0;
            ball.vy = 0;
            ball.spin = 0;
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
        collide(next[i], next[j]);
      }
    }
  }

  return next;
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

  // Wooden shaft, tapering darker toward the butt.
  const grad = ctx.createLinearGradient(tipX, tipY, buttX, buttY);
  grad.addColorStop(0, '#d9a86a');
  grad.addColorStop(1, '#6b4a2a');
  ctx.strokeStyle = grad;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(buttX, buttY);
  ctx.stroke();

  // White ferrule + blue tip.
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

function collide(a: PoolBall, b: PoolBall): void {
  if (a.pocketed || b.pocketed) return;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const minDist = BALL_R * 2;
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

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
