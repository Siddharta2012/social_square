import { POOL_PLAY_COST, type PoolState } from '@social-square/shared';
import React from 'react';
import { eventBus } from '../eventBus';
import { t } from '../i18n';
import { TABLE_H, TABLE_W } from './poolCanvasRenderer';

interface ScoreboardEntry {
  userId: string;
  username: string;
  score: number;
  fouls: number;
  isTurn: boolean;
  isWinner: boolean;
}

interface PoolOverlayViewProps {
  isCompact: boolean;
  panelStyle: React.CSSProperties;
  buttonStyle: React.CSSProperties;
  disabledStyle: React.CSSProperties;
  playersLabel: string;
  turnLabel: string;
  poolActive: boolean;
  poolExpired: boolean;
  poolTimeLeft: string;
  isPlayer: boolean;
  inlineMessage: { text: string; tone: 'info' | 'error' } | null;
  showScoreboard: boolean;
  scoreboard: ScoreboardEntry[];
  pool: PoolState;
  ballsRemaining: number;
  canPay: boolean;
  durationMinutes: number;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  canPlaceCue: boolean;
  canShoot: boolean;
  powerSetting: number;
  setPowerSetting: (value: number) => void;
  spinSetting: number;
  setSpinSetting: (value: number) => void;
  spinDirection: string;
  petals: number;
  hidePoolOverlay: () => void;
  requestPoolAction: (action: 'pool-start-solo' | 'pool-create-duo' | 'pool-join-duo') => void;
  handlePointerDown: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  handlePointerMove: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  handlePointerUp: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  shootCurrentAim: () => void;
}

export const PoolOverlayView: React.FC<PoolOverlayViewProps> = ({
  isCompact,
  panelStyle,
  buttonStyle,
  disabledStyle,
  playersLabel,
  turnLabel,
  poolActive,
  poolExpired,
  poolTimeLeft,
  isPlayer,
  inlineMessage,
  showScoreboard,
  scoreboard,
  pool,
  ballsRemaining,
  canPay,
  durationMinutes,
  canvasRef,
  canPlaceCue,
  canShoot,
  powerSetting,
  setPowerSetting,
  spinSetting,
  setSpinSetting,
  spinDirection,
  petals,
  hidePoolOverlay,
  requestPoolAction,
  handlePointerDown,
  handlePointerMove,
  handlePointerUp,
  shootCurrentAim,
}) => {
  const stopOverlayEvent = (event: React.SyntheticEvent) => {
    event.stopPropagation();
  };

  return (
    <div
      onPointerDown={stopOverlayEvent}
      onPointerMove={stopOverlayEvent}
      onPointerUp={stopOverlayEvent}
      onPointerCancel={stopOverlayEvent}
      onClick={stopOverlayEvent}
      onWheel={stopOverlayEvent}
      onKeyDown={stopOverlayEvent}
      onKeyUp={stopOverlayEvent}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 146,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(2,5,10,0.58)',
        pointerEvents: 'auto',
        fontFamily: 'monospace',
      }}
    >
      <div style={panelStyle}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '12px',
            alignItems: 'center',
            marginBottom: '10px',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ color: '#fff4d0', fontSize: '15px', fontWeight: 700 }}>
              {t('pool.title')}
            </div>
            <div
              style={{
                color: '#88caae',
                fontSize: '11px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {playersLabel} - {turnLabel}
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              gap: '7px',
              alignItems: 'center',
              flexWrap: 'wrap',
              justifyContent: 'flex-end',
            }}
          >
            {poolActive && (
              <div
                style={{
                  minWidth: '64px',
                  textAlign: 'center',
                  color: poolExpired ? '#ffd3ca' : '#fff4d0',
                  background: poolExpired ? 'rgba(255,105,91,0.14)' : 'rgba(255,244,208,0.08)',
                  border: poolExpired
                    ? '1px solid rgba(255,105,91,0.38)'
                    : '1px solid rgba(255,244,208,0.26)',
                  borderRadius: '5px',
                  padding: '6px 8px',
                  fontWeight: 700,
                  fontSize: '12px',
                }}
              >
                {poolTimeLeft || '0:00'}
              </div>
            )}
            {isPlayer && (
              <button type="button" style={buttonStyle} onClick={() => eventBus.emit('pool-leave')}>
                {t('pool.leave')}
              </button>
            )}
            <button type="button" style={buttonStyle} onClick={hidePoolOverlay}>
              {t('pool.hide')}
            </button>
          </div>
        </div>

        {inlineMessage && (
          <div
            role="status"
            aria-live="polite"
            style={{
              marginBottom: '10px',
              color: inlineMessage.tone === 'error' ? '#ffd3ca' : '#dfffee',
              background:
                inlineMessage.tone === 'error' ? 'rgba(255,105,91,0.12)' : 'rgba(120,255,190,0.08)',
              border:
                inlineMessage.tone === 'error'
                  ? '1px solid rgba(255,105,91,0.32)'
                  : '1px solid rgba(120,255,190,0.22)',
              borderRadius: '6px',
              padding: '8px 10px',
              fontSize: '12px',
              lineHeight: 1.35,
            }}
          >
            {inlineMessage.text}
          </div>
        )}

        {showScoreboard && (
          <div
            style={{
              marginBottom: '10px',
              background: 'rgba(120,255,190,0.05)',
              border: '1px solid rgba(120,255,190,0.18)',
              borderRadius: '6px',
              padding: '8px 10px',
            }}
          >
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'stretch' }}>
              {scoreboard.map((entry) => (
                <div
                  key={entry.userId}
                  style={{
                    flex: '1 1 120px',
                    minWidth: '120px',
                    borderRadius: '5px',
                    padding: '6px 8px',
                    background: entry.isTurn ? 'rgba(255,244,208,0.12)' : 'rgba(255,255,255,0.03)',
                    border: entry.isWinner
                      ? '1px solid rgba(136,255,187,0.6)'
                      : entry.isTurn
                        ? '1px solid rgba(255,244,208,0.4)'
                        : '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      gap: '6px',
                    }}
                  >
                    <span
                      style={{
                        color: entry.isWinner ? '#bfffe4' : '#fff4d0',
                        fontSize: '12px',
                        fontWeight: 700,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {entry.isWinner ? '🏆 ' : entry.isTurn ? '▸ ' : ''}
                      {entry.username}
                    </span>
                    <span style={{ color: '#88ffbb', fontSize: '16px', fontWeight: 700 }}>
                      {entry.score}
                    </span>
                  </div>
                  <div style={{ color: '#88caae', fontSize: '10px', marginTop: '2px' }}>
                    {entry.fouls > 0
                      ? t('pool.scoreFouls', { count: entry.fouls })
                      : t('pool.noFoul')}
                  </div>
                </div>
              ))}
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '8px',
                marginTop: '7px',
                color: '#88caae',
                fontSize: '11px',
              }}
            >
              <span>{pool.message ?? t('pool.ballsRemaining', { count: ballsRemaining })}</span>
              <span>{t('pool.scoreBalls', { count: ballsRemaining })}</span>
            </div>
          </div>
        )}

        {(pool.phase === 'idle' || pool.phase === 'finished' || pool.players.length === 0) && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isCompact ? '1fr' : '1fr 1fr',
              gap: '10px',
              marginBottom: '12px',
            }}
          >
            <button
              type="button"
              style={{
                ...buttonStyle,
                height: '74px',
                textAlign: 'left',
                ...(!canPay ? disabledStyle : {}),
              }}
              aria-disabled={!canPay}
              onClick={() => requestPoolAction('pool-start-solo')}
            >
              <strong>{pool.phase === 'finished' ? t('pool.soloRematch') : t('pool.solo')}</strong>
              <br />
              {t('pool.price', { minutes: durationMinutes, cost: POOL_PLAY_COST })}
            </button>
            <button
              type="button"
              style={{
                ...buttonStyle,
                height: '74px',
                textAlign: 'left',
                ...(!canPay ? disabledStyle : {}),
              }}
              aria-disabled={!canPay}
              onClick={() => requestPoolAction('pool-create-duo')}
            >
              <strong>
                {pool.phase === 'finished' ? t('pool.duoRematch') : t('pool.createDuo')}
              </strong>
              <br />
              {t('pool.perPerson', { minutes: durationMinutes, cost: POOL_PLAY_COST })}
            </button>
          </div>
        )}

        {pool.phase === 'waiting' && (
          <div
            style={{
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
            }}
          >
            <div>
              <div style={{ color: '#fff4d0', fontWeight: 700 }}>{t('pool.waitingTitle')}</div>
              <div style={{ color: '#88caae', fontSize: '11px', marginTop: '3px' }}>
                {t('pool.joinInfo', {
                  username: pool.players[0]?.username ?? t('pool.someone'),
                  cost: POOL_PLAY_COST,
                  minutes: durationMinutes,
                })}
              </div>
            </div>
            {!isPlayer && (
              <button
                type="button"
                style={{ ...buttonStyle, ...(!canPay ? disabledStyle : {}) }}
                aria-disabled={!canPay}
                onClick={() => requestPoolAction('pool-join-duo')}
              >
                {t('pool.join', { cost: POOL_PLAY_COST })}
              </button>
            )}
          </div>
        )}

        <canvas
          ref={canvasRef}
          width={TABLE_W}
          height={TABLE_H}
          aria-label={canPlaceCue ? t('pool.placeCue') : t('pool.tableAria')}
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
            cursor: canPlaceCue ? 'grab' : canShoot ? 'crosshair' : 'default',
            background: '#123826',
          }}
        />

        {isPlayer && pool.phase === 'playing' && (
          <div
            style={{
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
            }}
          >
            <label style={{ display: 'grid', gap: '5px', fontSize: '11px', color: '#88caae' }}>
              <span>{t('pool.power', { percent: Math.round(powerSetting * 100) })}</span>
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
              <span>{t('pool.spin', { direction: spinDirection })}</span>
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
              {t('pool.shoot')}
            </button>
          </div>
        )}

        <div
          style={{
            marginTop: '9px',
            display: 'flex',
            justifyContent: 'space-between',
            gap: '8px',
            color: '#88caae',
            fontSize: '11px',
          }}
        >
          <span>{canShoot ? t('pool.aimReady') : turnLabel}</span>
          <span>{t('pool.petals', { count: petals })}</span>
        </div>
      </div>
    </div>
  );
};
