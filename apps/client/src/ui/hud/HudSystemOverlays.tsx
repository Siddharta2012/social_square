import { Fragment } from 'react';
import { AudioSettingsModal } from '../AudioSettingsModal';
import { AuthForm } from '../AuthForm';
import { useHudContext } from './HudContext';

export function HudSystemOverlays() {
  const { worldLoading, travelTargetName, inRoom, showDebugOverlay, debugRows, showAuthForm, handleAuthSuccess, showAudioSettings, setShowAudioSettings, handleInputChange } = useHudContext();
  return (
    <>
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
          {travelTargetName ? `Verso ${travelTargetName}...` : 'Caricamento area...'}
        </div>
      )}

      {inRoom && showDebugOverlay && (
        <div style={{
          position: 'absolute',
          top: '52px',
          left: '12px',
          zIndex: 151,
          minWidth: '220px',
          maxWidth: 'min(340px, calc(100vw - 24px))',
          background: 'rgba(4,6,14,0.86)',
          border: '1px solid rgba(120,200,255,0.35)',
          borderRadius: '4px',
          padding: '8px 9px',
          color: '#bfe8ff',
          fontFamily: 'monospace',
          fontSize: '10px',
          pointerEvents: 'none',
          boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '12px',
            marginBottom: '5px',
            color: '#fff4d0',
            fontWeight: 700,
          }}>
            <span>Performance</span>
            <span>F3</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '76px 1fr', gap: '3px 8px' }}>
            {debugRows.map(([label, value]: [string, string | number]) => (
              <Fragment key={label}>
                <span style={{ color: '#6f94aa' }}>{label}</span>
                <span style={{
                  color: '#d7f5ff',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {value}
                </span>
              </Fragment>
            ))}
          </div>
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
    </>
  );
}
