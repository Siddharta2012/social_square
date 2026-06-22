import { DAILY_QUESTS } from '@social-square/shared';
import { t } from '../../i18n';
import { useHudContext } from './HudContext';

export function HudStatusBars() {
  const { isCompactHud, inRoom, locationName, roomName, routeHint, petals, progress, progressTitle, completedQuestCount, usersInRoom, isConnected, username, speakingUsers, jukeboxActive, jukeboxTimeLeft, poolActive, poolTimeLeft, poolIsMine } = useHudContext();
  return (
    <>
      {/* Top bar */}
      <div style={{
        position: 'absolute',
        top: isCompactHud ? '8px' : 0,
        left: isCompactHud ? '8px' : 0,
        right: isCompactHud ? '8px' : 0,
        padding: isCompactHud ? '7px 10px' : '8px 16px',
        background: 'rgba(10,10,30,0.85)',
        backdropFilter: 'blur(4px)',
        color: '#e0e0ff',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: isCompactHud ? '8px' : undefined,
        fontSize: isCompactHud ? '11px' : '12px',
        borderBottom: '1px solid rgba(100,100,200,0.2)',
        borderRadius: isCompactHud ? '7px' : 0,
        pointerEvents: 'auto',
      }}>
        <span style={{
          fontWeight: 'bold',
          color: '#8888ff',
          letterSpacing: '0.05em',
          display: isCompactHud ? 'none' : 'inline',
        }}>
          Social Square
        </span>

        {inRoom && (locationName || roomName) && (
          <div style={{
            position: isCompactHud ? 'static' : 'absolute',
            left: isCompactHud ? undefined : '50%',
            transform: isCompactHud ? undefined : 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: isCompactHud ? 'flex-start' : 'center',
            gap: '1px',
            minWidth: 0,
            flex: isCompactHud ? 1 : undefined,
            pointerEvents: 'none',
          }}>
            <span style={{
              color: '#fff4d0',
              fontSize: isCompactHud ? '12px' : '13px',
              fontWeight: 700,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: isCompactHud ? '52vw' : undefined,
            }}>
              {locationName ?? roomName}
            </span>
            <span style={{
              color: routeHint ? '#88ffbb' : '#7777aa',
              fontSize: '9px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: isCompactHud ? '52vw' : undefined,
            }}>
              {routeHint ?? 'location'}
            </span>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: isCompactHud ? '6px' : '12px' }}>
          {inRoom && (
            <span style={{
              color: '#ffe14d',
              fontSize: '11px',
              border: '1px solid rgba(255,225,77,0.28)',
              background: 'rgba(255,225,77,0.08)',
              padding: '3px 7px',
              borderRadius: '3px',
            }}>
              {t('hud.petals', { count: petals })}
            </span>
          )}
          {inRoom && progress && (
            <span
              title={progressTitle}
              style={{
                color: '#88ffbb',
                fontSize: '11px',
                border: '1px solid rgba(136,255,187,0.28)',
                background: 'rgba(136,255,187,0.08)',
                padding: '3px 7px',
                borderRadius: '3px',
                whiteSpace: 'nowrap',
              }}
            >
              Lv {progress.level} - {progress.streakDays}d - Q {completedQuestCount}/{DAILY_QUESTS.length}
            </span>
          )}
          {inRoom && !isCompactHud && (
            <span style={{ color: '#8888aa', fontSize: '11px' }}>
              {usersInRoom} {usersInRoom === 1 ? 'utente' : 'utenti'}
            </span>
          )}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            fontSize: '11px',
            color: isConnected ? '#44ff88' : inRoom ? '#ff4444' : '#555588',
          }}>
            <span style={{
              display: 'inline-block',
              width: '7px', height: '7px', borderRadius: '50%',
              background: isConnected ? '#44ff88' : inRoom ? '#ff4444' : '#333355',
              boxShadow: isConnected ? '0 0 6px #44ff88aa' : 'none',
            }} />
            {isCompactHud ? '' : isConnected ? (username ?? t('hud.connected')) : inRoom ? t('hud.disconnected') : ''}
          </span>
        </div>
      </div>

      {/* Bottom bar — solo in stanza */}
      {inRoom && speakingUsers.length > 0 && (
        <div style={{
          position: 'absolute',
          top: isCompactHud ? '58px' : '50px',
          right: isCompactHud ? '8px' : '16px',
          zIndex: 124,
          display: 'flex',
          flexDirection: 'column',
          gap: '5px',
          pointerEvents: 'none',
          maxWidth: isCompactHud ? 'calc(100vw - 16px)' : '260px',
        }}>
          {speakingUsers.map((speaker: any) => {
            const side = speaker.pan < -0.22 ? 'L' : speaker.pan > 0.22 ? 'R' : 'C';
            return (
              <div key={speaker.userId} style={{
                display: 'grid',
                gridTemplateColumns: '18px minmax(0, 1fr) auto',
                alignItems: 'center',
                gap: '7px',
                background: 'rgba(10,10,30,0.82)',
                border: '1px solid rgba(136,255,187,0.32)',
                borderRadius: '5px',
                padding: '5px 7px',
                color: '#dfffee',
                fontSize: '10px',
                boxShadow: '0 6px 16px rgba(0,0,0,0.22)',
              }}>
                <span style={{ color: '#88ffbb', fontWeight: 700 }}>{side}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {speaker.username}
                </span>
                <span style={{ color: '#88aabb' }}>{speaker.distance.toFixed(1)}m</span>
              </div>
            );
          })}
        </div>
      )}

      {inRoom && (jukeboxActive || (poolActive && poolTimeLeft)) && (
        <div style={{
          position: 'absolute',
          top: isCompactHud ? '58px' : '50px',
          left: isCompactHud ? '8px' : '16px',
          zIndex: 123,
          display: 'flex',
          gap: '6px',
          flexWrap: 'wrap',
          pointerEvents: 'none',
          maxWidth: isCompactHud ? 'calc(100vw - 16px)' : '420px',
        }}>
          {jukeboxActive && jukeboxTimeLeft && (
            <div style={{
              color: '#fff4d0',
              background: 'rgba(20,18,42,0.88)',
              border: '1px solid rgba(255,244,208,0.26)',
              borderRadius: '5px',
              padding: '5px 8px',
              fontSize: '11px',
              boxShadow: '0 8px 20px rgba(0,0,0,0.24)',
            }}>
              {t('hud.jukebox.timer', { time: jukeboxTimeLeft })}
            </div>
          )}
          {poolActive && poolTimeLeft && (
            <div style={{
              color: poolIsMine ? '#bfffe4' : '#d8dcff',
              background: 'rgba(10,24,22,0.88)',
              border: '1px solid rgba(120,255,190,0.26)',
              borderRadius: '5px',
              padding: '5px 8px',
              fontSize: '11px',
              boxShadow: '0 8px 20px rgba(0,0,0,0.24)',
            }}>
              {t('hud.pool.timer', { time: poolTimeLeft })}
            </div>
          )}
        </div>
      )}
    </>
  );
}
