import { JUKEBOX_PLAY_COST, POOL_PLAY_COST } from '@social-square/shared';
import { eventBus } from '../../eventBus';
import { t } from '../../i18n';
import { VoiceControls } from '../VoiceControls';
import { useHudContext } from './HudContext';

export function HudDesktopActionBar() {
  const { inRoom, isCompactHud, jukeboxStatus, jukeboxLabel, setJukeboxUrlError, setShowJukeboxLink, showJukeboxLink, smallButtonStyle, disabledButtonStyle, canUseJukebox, jukeboxActive, emitEmote, setShowWorldMap, showWorldMap, canUsePool, handleDailyPresence, dailyPresenceMsg, waiterAwaitingOrder, waiterButtonEnabled, canUseWaiter, waiterCanQueue, waiterLabel, localAvatarState, showAudioSettings, setShowAudioSettings, voiceAvailable, voiceMuted, handleVoiceToggle, handleExit, handleLogout, openShop, openFriends } = useHudContext();
  return (
    <>
      {inRoom && !isCompactHud && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: '8px 16px',
          background: 'rgba(10,10,30,0.85)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '11px',
          borderTop: '1px solid rgba(100,100,200,0.2)',
          pointerEvents: 'auto',
        }}>
          <span style={{ color: '#555588' }}>
            Clicca su un tile per muoverti &nbsp;·&nbsp; Scroll per zoom
          </span>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', minWidth: 0 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              color: jukeboxStatus?.blocked ? '#ffcc88' : '#aaaadd',
              minWidth: 0, maxWidth: '260px',
            }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {jukeboxLabel}
              </span>
              <button
                style={{ ...smallButtonStyle, ...(!canUseJukebox || jukeboxActive ? disabledButtonStyle : {}) }}
                disabled={!canUseJukebox || jukeboxActive}
                title={canUseJukebox ? t('common.petalsRequired', { cost: JUKEBOX_PLAY_COST }) : t('jukebox.near')}
                onClick={() => eventBus.emit('jukebox-toggle')}
              >
                Avvia
              </button>
              <button
                style={{ ...smallButtonStyle, ...(!canUseJukebox || jukeboxActive ? disabledButtonStyle : {}) }}
                disabled={!canUseJukebox || jukeboxActive}
                title={canUseJukebox ? t('common.petalsRequired', { cost: JUKEBOX_PLAY_COST }) : t('jukebox.near')}
                onClick={() => eventBus.emit('jukebox-next')}
              >
                Next
              </button>
              <button
                style={{ ...smallButtonStyle, ...(!canUseJukebox || jukeboxActive ? disabledButtonStyle : {}) }}
                disabled={!canUseJukebox || jukeboxActive}
                title={canUseJukebox ? t('hud.youtubePaste') : t('jukebox.near')}
                onClick={() => {
                  setJukeboxUrlError('');
                  setShowJukeboxLink(!showJukeboxLink);
                }}
              >
                Link
              </button>
            </div>

            <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
              <button style={smallButtonStyle} onClick={() => emitEmote('wave')}>Saluta</button>
              <button style={smallButtonStyle} onClick={() => emitEmote('dance')}>Balla</button>
              <button style={smallButtonStyle} onClick={() => emitEmote('clap')}>Applauso</button>
              <button style={smallButtonStyle} onClick={() => setShowWorldMap(!showWorldMap)}>
                Mappa
              </button>
              <button
                style={{ ...smallButtonStyle, ...(!canUsePool ? disabledButtonStyle : {}) }}
                disabled={!canUsePool}
                title={canUsePool ? t('common.petalsRequired', { cost: POOL_PLAY_COST }) : t('hud.nearPool')}
                onClick={() => eventBus.emit('pool-open')}
              >
                {t('hud.pool')}
              </button>
              <button style={smallButtonStyle} onClick={handleDailyPresence} title={dailyPresenceMsg || t('hud.presenceBonus')}>
                {t('hud.presence')}
              </button>
              <button style={smallButtonStyle} onClick={openShop}>
                Shop
              </button>
              <button style={smallButtonStyle} onClick={openFriends}>
                Amici
              </button>
              <button
                style={{
                  ...smallButtonStyle,
                  color: waiterAwaitingOrder ? '#ffe14d' : '#aaaaff',
                  borderColor: waiterAwaitingOrder ? 'rgba(255,225,77,0.55)' : 'rgba(150,150,255,0.35)',
                  opacity: waiterButtonEnabled ? 1 : 0.44,
                  cursor: waiterButtonEnabled ? 'pointer' : 'default',
                }}
                disabled={!waiterButtonEnabled}
                title={canUseWaiter ? waiterCanQueue ? t('hud.waiter.queue') : t('hud.waiter.call') : t('hud.waiter.near')}
                onClick={() => {
                  if (waiterButtonEnabled) eventBus.emit('waiter-call');
                }}
              >
                {waiterLabel}
              </button>
              {localAvatarState === 'sit' && (
                <button style={smallButtonStyle} onClick={() => eventBus.emit('leave-seat')}>
                  Alzati
                </button>
              )}
            </div>

            {/* Audio settings gear */}
            <button
              onClick={() => setShowAudioSettings(true)}
              title="Impostazioni audio"
              style={{
                background: showAudioSettings
                  ? 'rgba(150,150,255,0.25)'
                  : 'rgba(150,150,255,0.1)',
                border: '1px solid rgba(150,150,255,0.35)',
                color: '#aaaaff',
                fontFamily: 'monospace',
                fontSize: '14px',
                width: '32px', height: '28px',
                cursor: 'pointer', borderRadius: '3px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(150,150,255,0.25)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = showAudioSettings ? 'rgba(150,150,255,0.25)' : 'rgba(150,150,255,0.1)')}
            >
              ⚙
            </button>

            <VoiceControls
              available={voiceAvailable}
              muted={voiceMuted}
              onToggle={handleVoiceToggle}
            />

            <button
              onClick={handleExit}
              style={{
                background: 'rgba(255,80,80,0.15)',
                border: '1px solid rgba(255,80,80,0.4)',
                color: '#ff8888', fontFamily: 'monospace', fontSize: '11px',
                padding: '4px 14px', cursor: 'pointer', borderRadius: '3px',
                letterSpacing: '0.05em',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,80,80,0.3)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,80,80,0.15)')}
            >
              {t('hud.exit')}
            </button>
            <button
              onClick={handleLogout}
              style={{
                background: 'rgba(150,150,255,0.1)',
                border: '1px solid rgba(150,150,255,0.35)',
                color: '#aaaaff', fontFamily: 'monospace', fontSize: '11px',
                padding: '4px 10px', cursor: 'pointer', borderRadius: '3px',
              }}
            >
              Account
            </button>
          </div>
        </div>
      )}
    </>
  );
}
