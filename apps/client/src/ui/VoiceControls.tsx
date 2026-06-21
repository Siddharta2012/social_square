import React from 'react';

interface VoiceControlsProps {
  available: boolean;
  muted: boolean;
  onToggle: () => void;
}

export const VoiceControls: React.FC<VoiceControlsProps> = ({ available, muted, onToggle }) => {
  if (!available) return null;

  return (
    <button
      onClick={onToggle}
      title={muted ? 'Riattiva microfono' : 'Silenzia microfono'}
      style={{
        background: muted ? 'rgba(255,80,80,0.2)' : 'rgba(68,255,136,0.15)',
        border: muted
          ? '1px solid rgba(255,80,80,0.5)'
          : '1px solid rgba(68,255,136,0.4)',
        color: muted ? '#ff8888' : '#44ff88',
        fontFamily: 'monospace',
        fontSize: '16px',
        width: '32px',
        height: '28px',
        cursor: 'pointer',
        borderRadius: '3px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.opacity = '0.8';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.opacity = '1';
      }}
    >
      {muted ? '🔇' : '🎤'}
    </button>
  );
};
