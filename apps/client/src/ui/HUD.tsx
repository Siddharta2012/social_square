import React, { useState } from 'react';
import { CHAT_MAX_LENGTH, ORDER_ITEMS, PETAL_ACTION_COST, normalizeChatText, orderItemLabel } from '@social-square/shared';
import type { EmoteId } from '@social-square/shared';
import { useGameStore } from '../store/gameStore';
import { useUserStore } from '../store/userStore';
import { AuthForm } from './AuthForm';
import { VoiceControls } from './VoiceControls';
import { AudioSettingsModal } from './AudioSettingsModal';
import { eventBus } from '../eventBus';

export const HUD: React.FC = () => {
  const showAuthForm = useGameStore((s) => s.showAuthForm);
  const setShowAuthForm = useGameStore((s) => s.setShowAuthForm);
  const showAudioSettings = useGameStore((s) => s.showAudioSettings);
  const setShowAudioSettings = useGameStore((s) => s.setShowAudioSettings);
  const isConnected = useGameStore((s) => s.isConnected);
  const currentRoomId = useGameStore((s) => s.currentRoomId);
  const roomName = useGameStore((s) => s.roomName);
  const locationName = useGameStore((s) => s.locationName);
  const usersInRoom = useGameStore((s) => s.usersInRoom);
  const petals = useGameStore((s) => s.petals);
  const voiceAvailable = useGameStore((s) => s.voiceAvailable);
  const voiceMuted = useGameStore((s) => s.voiceMuted);
  const setVoiceMuted = useGameStore((s) => s.setVoiceMuted);
  const heldItem = useGameStore((s) => s.heldItem);
  const worldLoading = useGameStore((s) => s.worldLoading);
  const localAvatarState = useGameStore((s) => s.localAvatarState);
  const jukeboxStatus = useGameStore((s) => s.jukeboxStatus);
  const chatMessages = useGameStore((s) => s.chatMessages);
  const waiterStatus = useGameStore((s) => s.waiterStatus);
  const actionAvailability = useGameStore((s) => s.actionAvailability);
  const userId = useUserStore((s) => s.userId);
  const username = useUserStore((s) => s.username);
  const setUser = useUserStore((s) => s.setUser);
  const [chatDraft, setChatDraft] = useState('');

  const inRoom = currentRoomId !== null;

  const handleAuthSuccess = (userId: string, uname: string, token: string) => {
    setUser(userId, uname, token);
    setShowAuthForm(false);
    eventBus.emit('start-game', uname);
  };

  const handleExit = () => { eventBus.emit('exit-room'); };

  const handleVoiceToggle = () => {
    eventBus.emit('voice-toggle');
    setVoiceMuted(!voiceMuted);
  };

  const handleInputChange = (deviceId: string) => {
    eventBus.emit('audio-input-change', deviceId);
  };

  const emitEmote = (emoteId: EmoteId) => {
    eventBus.emit('emote', emoteId);
  };

  const sendChat = () => {
    const text = normalizeChatText(chatDraft);
    if (!text) return;
    eventBus.emit('chat-send', text);
    setChatDraft('');
  };

  const waiterIsMine = waiterStatus?.customerId === userId;
  const waiterCanCall = !waiterStatus || waiterStatus.phase === 'idle' || waiterStatus.phase === 'delivered';
  const waiterAwaitingOrder = waiterStatus?.phase === 'awaiting-order' && waiterIsMine;
  const canUseJukebox = actionAvailability.nearJukebox;
  const canUseWaiter = actionAvailability.nearWaiter;
  const canAffordAction = petals >= PETAL_ACTION_COST;
  const waiterButtonEnabled = canUseWaiter && (waiterCanCall || waiterIsMine);
  const waiterLabel = waiterCanCall
    ? 'Cameriere'
    : waiterStatus?.phase === 'approaching'
      ? 'Arrivo...'
      : waiterStatus?.phase === 'awaiting-order'
        ? waiterIsMine ? 'Scegli' : 'Occupato'
        : waiterStatus?.phase === 'to-counter'
          ? 'Al bancone'
          : waiterStatus?.phase === 'delivering'
            ? 'In consegna'
            : waiterStatus?.phase === 'returning'
              ? 'Rientro'
              : 'Cameriere';

  const smallButtonStyle: React.CSSProperties = {
    background: 'rgba(150,150,255,0.1)',
    border: '1px solid rgba(150,150,255,0.35)',
    color: '#aaaaff',
    fontFamily: 'monospace',
    fontSize: '11px',
    height: '28px',
    padding: '0 9px',
    cursor: 'pointer',
    borderRadius: '3px',
  };

  const disabledButtonStyle: React.CSSProperties = {
    opacity: 0.44,
    cursor: 'default',
  };

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0,
      width: '100%', height: '100%',
      pointerEvents: 'none', fontFamily: 'monospace',
    }}>
      {/* Top bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        padding: '8px 16px',
        background: 'rgba(10,10,30,0.85)',
        backdropFilter: 'blur(4px)',
        color: '#e0e0ff',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '12px',
        borderBottom: '1px solid rgba(100,100,200,0.2)',
        pointerEvents: 'auto',
      }}>
        <span style={{ fontWeight: 'bold', color: '#8888ff', letterSpacing: '0.05em' }}>
          Social Square
        </span>

        {inRoom && (locationName || roomName) && (
          <div style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1px',
            pointerEvents: 'none',
          }}>
            <span style={{ color: '#fff4d0', fontSize: '13px', fontWeight: 700 }}>
              {locationName ?? roomName}
            </span>
            <span style={{ color: '#7777aa', fontSize: '9px' }}>
              location
            </span>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {inRoom && (
            <span style={{
              color: '#ffe14d',
              fontSize: '11px',
              border: '1px solid rgba(255,225,77,0.28)',
              background: 'rgba(255,225,77,0.08)',
              padding: '3px 7px',
              borderRadius: '3px',
            }}>
              Petali {petals}
            </span>
          )}
          {inRoom && (
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
            {isConnected ? (username ?? 'connesso') : inRoom ? 'disconnesso' : ''}
          </span>
        </div>
      </div>

      {/* Bottom bar — solo in stanza */}
      {inRoom && (
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
                {jukeboxStatus?.playing ? jukeboxStatus.title : 'Jukebox'}
              </span>
              <button
                style={{ ...smallButtonStyle, ...(!canUseJukebox ? disabledButtonStyle : {}) }}
                disabled={!canUseJukebox}
                title={canUseJukebox ? 'Play/Stop jukebox' : 'Avvicinati al jukebox'}
                onClick={() => eventBus.emit('jukebox-toggle')}
              >
                {jukeboxStatus?.playing ? 'Stop' : 'Play'}
              </button>
              <button
                style={{ ...smallButtonStyle, ...(!canUseJukebox ? disabledButtonStyle : {}) }}
                disabled={!canUseJukebox}
                title={canUseJukebox ? 'Brano successivo' : 'Avvicinati al jukebox'}
                onClick={() => eventBus.emit('jukebox-next')}
              >
                Next
              </button>
            </div>

            <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
              <button style={smallButtonStyle} onClick={() => emitEmote('wave')}>Saluta</button>
              <button style={smallButtonStyle} onClick={() => emitEmote('dance')}>Balla</button>
              <button style={smallButtonStyle} onClick={() => emitEmote('clap')}>Applauso</button>
              <button
                style={{
                  ...smallButtonStyle,
                  color: waiterAwaitingOrder ? '#ffe14d' : '#aaaaff',
                  borderColor: waiterAwaitingOrder ? 'rgba(255,225,77,0.55)' : 'rgba(150,150,255,0.35)',
                  opacity: waiterButtonEnabled ? 1 : 0.44,
                  cursor: waiterButtonEnabled ? 'pointer' : 'default',
                }}
                disabled={!waiterButtonEnabled}
                title={canUseWaiter ? 'Chiama il cameriere' : 'Avvicinati al cameriere'}
                onClick={() => {
                  if (waiterCanCall && canUseWaiter) eventBus.emit('waiter-call');
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
              Esci
            </button>
          </div>
        </div>
      )}

      {/* Held-item prompt — centered above the bottom bar */}
      {inRoom && heldItem && (
        <div style={{
          position: 'absolute', bottom: '52px', left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(10,10,30,0.9)',
          border: '1px solid rgba(255,225,77,0.5)',
          borderRadius: '6px',
          padding: '6px 14px',
          color: '#fff4d0',
          fontFamily: 'monospace',
          fontSize: '12px',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <span style={{ fontSize: '16px' }}>{heldItem === 'beer' ? '🍺' : '🥨'}</span>
          Premi
          <kbd style={{
            background: 'rgba(255,225,77,0.18)',
            border: '1px solid rgba(255,225,77,0.6)',
            borderRadius: '3px',
            padding: '1px 7px',
            color: '#ffe14d',
            fontWeight: 'bold',
          }}>B</kbd>
          per {heldItem === 'beer' ? 'bere' : 'mangiare'}
        </div>
      )}

      {/* Chat */}
      {inRoom && (
        <div style={{
          position: 'absolute',
          left: '16px',
          bottom: heldItem ? '96px' : '52px',
          width: 'min(360px, calc(100vw - 32px))',
          pointerEvents: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}>
          {chatMessages.length > 0 && (
            <div style={{
              maxHeight: '118px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              gap: '4px',
              pointerEvents: 'none',
            }}>
              {chatMessages.slice(-4).map((message) => (
                <div key={message.id} style={{
                  background: 'rgba(10,10,30,0.78)',
                  border: '1px solid rgba(150,150,255,0.16)',
                  borderRadius: '5px',
                  padding: '4px 7px',
                  color: '#e0e0ff',
                  fontSize: '11px',
                  lineHeight: 1.35,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                }}>
                  <span style={{ color: '#88ffbb', fontWeight: 'bold' }}>{message.username}</span>
                  <span style={{ color: '#7777aa' }}>:</span>{' '}
                  <span>{message.text}</span>
                </div>
              ))}
            </div>
          )}

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
                height: '30px',
                boxSizing: 'border-box',
                background: 'rgba(10,10,30,0.88)',
                border: '1px solid rgba(150,150,255,0.32)',
                borderRadius: '4px',
                color: '#e0e0ff',
                fontFamily: 'monospace',
                fontSize: '12px',
                padding: '0 9px',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={!normalizeChatText(chatDraft)}
              style={{
                ...smallButtonStyle,
                height: '30px',
                opacity: normalizeChatText(chatDraft) ? 1 : 0.48,
                cursor: normalizeChatText(chatDraft) ? 'pointer' : 'default',
              }}
            >
              Invia
            </button>
          </form>
        </div>
      )}

      {/* Order menu */}
      {inRoom && waiterAwaitingOrder && (
        <div style={{
          position: 'absolute',
          right: '16px',
          bottom: '52px',
          zIndex: 120,
          background: 'rgba(10,10,30,0.92)',
          border: '1px solid rgba(255,225,77,0.42)',
          borderRadius: '6px',
          padding: '8px',
          display: 'flex',
          gap: '7px',
          alignItems: 'center',
          pointerEvents: 'auto',
          boxShadow: '0 6px 18px rgba(0,0,0,0.28)',
        }}>
          <span style={{ color: '#fff4d0', fontSize: '11px' }}>
            Ordina - {PETAL_ACTION_COST} petali
          </span>
          {ORDER_ITEMS.map((item) => (
            <button
              key={item.id}
              style={{
                ...smallButtonStyle,
                color: '#ffe14d',
                borderColor: 'rgba(255,225,77,0.45)',
                ...(!canUseWaiter || !canAffordAction ? disabledButtonStyle : {}),
              }}
              disabled={!canUseWaiter || !canAffordAction}
              title={!canUseWaiter
                ? 'Avvicinati al cameriere'
                : !canAffordAction
                  ? `Servono ${PETAL_ACTION_COST} petali`
                  : `${PETAL_ACTION_COST} petali`}
              onClick={() => {
                if (canUseWaiter && canAffordAction) eventBus.emit('waiter-order', item.id);
              }}
            >
              {orderItemLabel(item.id)}
            </button>
          ))}
        </div>
      )}

      {/* World loading feedback */}
      {worldLoading === 'initial' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 150,
          display: 'flex', flexDirection: 'column', gap: '14px',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(8,8,20,0.95)',
          color: '#aaaaff', fontFamily: 'monospace', fontSize: '14px',
          pointerEvents: 'auto',
        }}>
          <div style={{
            width: '28px', height: '28px',
            border: '3px solid rgba(120,120,255,0.25)',
            borderTopColor: '#8888ff',
            borderRadius: '50%',
            animation: 'spin 0.7s linear infinite',
          }} />
          Caricamento mondo...
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
      {worldLoading === 'streaming' && (
        <div style={{
          position: 'absolute', top: '48px', right: '12px', zIndex: 150,
          background: 'rgba(10,10,30,0.85)',
          border: '1px solid rgba(120,120,255,0.3)',
          borderRadius: '4px', padding: '5px 10px',
          color: '#8888cc', fontFamily: 'monospace', fontSize: '11px',
          pointerEvents: 'none',
        }}>
          Caricamento area...
        </div>
      )}

      {/* Auth form overlay */}
      {showAuthForm && <AuthForm onSuccess={handleAuthSuccess} />}

      {/* Audio settings modal */}
      {showAudioSettings && (
        <AudioSettingsModal
          onClose={() => setShowAudioSettings(false)}
          onInputChange={handleInputChange}
        />
      )}
    </div>
  );
};
