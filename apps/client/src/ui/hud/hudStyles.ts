import type React from 'react';

export const smallButtonStyle: React.CSSProperties = {
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

export const disabledButtonStyle: React.CSSProperties = {
  opacity: 0.44,
  cursor: 'default',
};

export const mobileButtonStyle: React.CSSProperties = {
  ...smallButtonStyle,
  flex: 1,
  minWidth: 0,
  height: '42px',
  padding: '0 6px',
  fontSize: '10px',
  borderRadius: '5px',
};

export const mobileSheetStyle: React.CSSProperties = {
  position: 'absolute',
  left: '8px',
  right: '8px',
  bottom: '60px',
  zIndex: 132,
  maxHeight: '46vh',
  overflowY: 'auto',
  background: 'rgba(8,10,24,0.94)',
  border: '1px solid rgba(150,150,255,0.34)',
  borderRadius: '8px',
  padding: '10px',
  pointerEvents: 'auto',
  boxShadow: '0 14px 34px rgba(0,0,0,0.42)',
};
