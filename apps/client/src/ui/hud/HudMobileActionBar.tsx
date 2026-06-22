import { CHAT_MAX_LENGTH, normalizeChatText } from '@social-square/shared';
import { eventBus } from '../../eventBus';
import { t } from '../../i18n';
import { useHudContext } from './HudContext';

export function HudMobileActionBar() {
  const { inRoom, isCompactHud, mobilePanel, setMobilePanel, mobileButtonStyle, setShowWorldMap, showWorldMap, setShowAudioSettings, mobileSheetStyle, smallButtonStyle, heldItem, emitEmote, handleDailyPresence, dailyPresenceMsg, openShop, openFriends, canUsePool, disabledButtonStyle, canUseJukebox, jukeboxActive, setJukeboxUrlError, setShowJukeboxLink, showJukeboxLink, localAvatarState, waiterAwaitingOrder, waiterButtonEnabled, waiterLabel, jukeboxStatus, jukeboxLabel, handleExit, handleLogout, chatMessages, chatDraft, setChatDraft, sendChat } = useHudContext();
  return (
    <>
      {inRoom && isCompactHud && (
        <>
          <div style={{
            position: 'absolute',
            left: '8px',
            right: '8px',
            bottom: '8px',
            zIndex: 131,
            display: 'flex',
            gap: '6px',
            pointerEvents: 'auto',
          }}>
            <button
              style={{
                ...mobileButtonStyle,
                color: mobilePanel === 'actions' ? '#ffe14d' : '#aaaaff',
                borderColor: mobilePanel === 'actions' ? 'rgba(255,225,77,0.55)' : 'rgba(150,150,255,0.35)',
              }}
              onClick={() => setMobilePanel(mobilePanel === 'actions' ? null : 'actions')}
            >
              Azioni
            </button>
            <button
              style={{
                ...mobileButtonStyle,
                color: mobilePanel === 'chat' ? '#ffe14d' : '#aaaaff',
                borderColor: mobilePanel === 'chat' ? 'rgba(255,225,77,0.55)' : 'rgba(150,150,255,0.35)',
              }}
              onClick={() => setMobilePanel(mobilePanel === 'chat' ? null : 'chat')}
            >
              Chat
            </button>
            <button
              style={mobileButtonStyle}
              onClick={() => {
                setMobilePanel(null);
                setShowWorldMap(!showWorldMap);
              }}
            >
              Mappa
            </button>
            <button
              style={mobileButtonStyle}
              onClick={() => {
                setMobilePanel(null);
                setShowAudioSettings(true);
              }}
            >
              Audio
            </button>
          </div>

          {mobilePanel === 'actions' && (
            <div style={mobileSheetStyle}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '9px',
              }}>
                <span style={{ color: '#fff4d0', fontSize: '12px', fontWeight: 700 }}>
                  Azioni
                </span>
                <button style={smallButtonStyle} onClick={() => setMobilePanel(null)}>
                  Chiudi
                </button>
              </div>

              {heldItem && (
                <button
                  style={{
                    ...smallButtonStyle,
                    width: '100%',
                    height: '40px',
                    marginBottom: '8px',
                    color: '#ffe14d',
                    borderColor: 'rgba(255,225,77,0.48)',
                  }}
                  onClick={() => eventBus.emit('consume-held-item')}
                >
                  Usa {heldItem === 'beer' ? 'birra' : 'pretzel'}
                </button>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '8px' }}>
                <button style={smallButtonStyle} onClick={() => emitEmote('wave')}>Saluta</button>
                <button style={smallButtonStyle} onClick={() => emitEmote('dance')}>Balla</button>
                <button style={smallButtonStyle} onClick={() => emitEmote('clap')}>Applauso</button>
              </div>

              <button
                style={{
                  ...smallButtonStyle,
                  width: '100%',
                  height: '36px',
                  marginBottom: '8px',
                  color: dailyPresenceMsg.startsWith('+') ? '#ffe14d' : '#aaaaff',
                }}
                onClick={handleDailyPresence}
              >
                {dailyPresenceMsg || 'Bonus presenza'}
              </button>

              <button
                style={{
                  ...smallButtonStyle,
                  width: '100%',
                  height: '36px',
                  marginBottom: '8px',
                }}
                onClick={() => {
                  setMobilePanel(null);
                  openShop();
                }}
              >
                Shop cosmetici
              </button>

              <button
                style={{
                  ...smallButtonStyle,
                  width: '100%',
                  height: '36px',
                  marginBottom: '8px',
                }}
                onClick={() => {
                  setMobilePanel(null);
                  openFriends();
                }}
              >
                Amici
              </button>

              <button
                style={{
                  ...smallButtonStyle,
                  width: '100%',
                  height: '36px',
                  marginBottom: '8px',
                  ...(!canUsePool ? disabledButtonStyle : {}),
                }}
                disabled={!canUsePool}
                onClick={() => {
                  setMobilePanel(null);
                  eventBus.emit('pool-open');
                }}
              >
                {t('hud.pool')}
              </button>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '8px' }}>
                <button
                  style={{ ...smallButtonStyle, ...(!canUseJukebox || jukeboxActive ? disabledButtonStyle : {}) }}
                  disabled={!canUseJukebox || jukeboxActive}
                  onClick={() => eventBus.emit('jukebox-toggle')}
                >
                  {t('bar.station.jukebox').split(' - ')[0]}
                </button>
                <button
                  style={{ ...smallButtonStyle, ...(!canUseJukebox || jukeboxActive ? disabledButtonStyle : {}) }}
                  disabled={!canUseJukebox || jukeboxActive}
                  onClick={() => eventBus.emit('jukebox-next')}
                >
                  Next
                </button>
                <button
                  style={{ ...smallButtonStyle, ...(!canUseJukebox || jukeboxActive ? disabledButtonStyle : {}) }}
                  disabled={!canUseJukebox || jukeboxActive}
                  onClick={() => {
                    setJukeboxUrlError('');
                    setMobilePanel(null);
                    setShowJukeboxLink(!showJukeboxLink);
                  }}
                >
                  Link
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: localAvatarState === 'sit' ? '1fr 1fr' : '1fr', gap: '6px' }}>
                <button
                  style={{
                    ...smallButtonStyle,
                    height: '36px',
                    color: waiterAwaitingOrder ? '#ffe14d' : '#aaaaff',
                    borderColor: waiterAwaitingOrder ? 'rgba(255,225,77,0.55)' : 'rgba(150,150,255,0.35)',
                    opacity: waiterButtonEnabled ? 1 : 0.44,
                    cursor: waiterButtonEnabled ? 'pointer' : 'default',
                  }}
                  disabled={!waiterButtonEnabled}
                  onClick={() => {
                    if (waiterButtonEnabled) eventBus.emit('waiter-call');
                  }}
                >
                  {waiterLabel}
                </button>
                {localAvatarState === 'sit' && (
                  <button style={{ ...smallButtonStyle, height: '36px' }} onClick={() => eventBus.emit('leave-seat')}>
                    Alzati
                  </button>
                )}
              </div>

              {jukeboxStatus?.playing && (
                <div style={{
                  marginTop: '8px',
                  color: '#aaaadd',
                  fontSize: '10px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {jukeboxLabel}
                </div>
              )}

              <button
                onClick={handleExit}
                style={{
                  ...smallButtonStyle,
                  width: '100%',
                  height: '36px',
                  marginTop: '9px',
                  color: '#ff8888',
                  borderColor: 'rgba(255,80,80,0.42)',
                  background: 'rgba(255,80,80,0.14)',
                }}
              >
                {t('hud.exit')}
              </button>
              <button
                onClick={handleLogout}
                style={{
                  ...smallButtonStyle,
                  width: '100%',
                  height: '36px',
                  marginTop: '7px',
                }}
              >
                Cambia account
              </button>
            </div>
          )}

          {mobilePanel === 'chat' && (
            <div style={mobileSheetStyle}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px',
              }}>
                <span style={{ color: '#fff4d0', fontSize: '12px', fontWeight: 700 }}>
                  Chat
                </span>
                <button style={smallButtonStyle} onClick={() => setMobilePanel(null)}>
                  Chiudi
                </button>
              </div>

              <div style={{
                maxHeight: '24vh',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '5px',
                marginBottom: '8px',
              }}>
                {chatMessages.length === 0 && (
                  <span style={{ color: '#7777aa', fontSize: '11px' }}>{t('hud.chat.empty')}</span>
                )}
                {chatMessages.slice(-8).map((message: any) => (
                  <div key={message.id} style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(150,150,255,0.16)',
                    borderRadius: '5px',
                    padding: '5px 7px',
                    color: '#e0e0ff',
                    fontSize: '11px',
                    lineHeight: 1.35,
                  }}>
                    <span style={{ color: '#88ffbb', fontWeight: 'bold' }}>{message.username}</span>
                    <span style={{ color: '#7777aa' }}>:</span>{' '}
                    <span>{message.text}</span>
                  </div>
                ))}
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  sendChat();
                }}
                style={{ display: 'flex', gap: '6px' }}
              >
                <input
                  value={chatDraft}
                  maxLength={CHAT_MAX_LENGTH}
                  onChange={(event) => setChatDraft(event.target.value)}
                  placeholder="Scrivi..."
                  style={{
                    flex: 1,
                    minWidth: 0,
                    height: '38px',
                    boxSizing: 'border-box',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(150,150,255,0.32)',
                    borderRadius: '5px',
                    color: '#e0e0ff',
                    fontFamily: 'monospace',
                    fontSize: '13px',
                    padding: '0 10px',
                    outline: 'none',
                  }}
                />
                <button
                  type="submit"
                  disabled={!normalizeChatText(chatDraft)}
                  style={{
                    ...smallButtonStyle,
                    height: '38px',
                    opacity: normalizeChatText(chatDraft) ? 1 : 0.48,
                    cursor: normalizeChatText(chatDraft) ? 'pointer' : 'default',
                  }}
                >
                  Invia
                </button>
              </form>
            </div>
          )}
        </>
      )}
    </>
  );
}
