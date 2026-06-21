import React from 'react';
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
  const usersInRoom = useGameStore((s) => s.usersInRoom);
  const voiceAvailable = useGameStore((s) => s.voiceAvailable);
  const voiceMuted = useGameStore((s) => s.voiceMuted);
  const setVoiceMuted = useGameStore((s) => s.setVoiceMuted);
  const heldItem = useGameStore((s) => s.heldItem);
  const username = useUserStore((s) => s.username);
  const setUser = useUserStore((s) => s.setUser);

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

        {inRoom && roomName && (
          <span style={{ color: '#aaaadd', fontSize: '11px' }}>{roomName}</span>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
