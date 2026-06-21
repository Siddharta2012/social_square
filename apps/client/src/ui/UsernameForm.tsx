import React, { useEffect, useRef, useState } from 'react';

interface UsernameFormProps {
  onSubmit: (username: string) => void;
}

export const UsernameForm: React.FC<UsernameFormProps> = ({ onSubmit }) => {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed.length < 2) { setError('Minimo 2 caratteri'); return; }
    if (trimmed.length > 20) { setError('Massimo 20 caratteri'); return; }
    onSubmit(trimmed);
  };

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(10,10,20,0.88)', zIndex: 100, pointerEvents: 'auto',
    }}>
      <form onSubmit={handleSubmit} style={{
        background: '#1a1a2e', border: '2px solid #4444aa',
        padding: '32px 40px', display: 'flex', flexDirection: 'column',
        gap: '14px', minWidth: '300px', fontFamily: 'monospace',
      }}>
        <h2 style={{ color: '#e0e0ff', fontSize: '17px', margin: 0 }}>
          Scegli il tuo nome
        </h2>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(''); }}
          placeholder="es. Marco, Luna, ..."
          maxLength={20}
          style={{
            background: '#0d0d1a', border: '1px solid #4444aa',
            color: '#e0e0ff', padding: '10px 12px',
            fontSize: '15px', fontFamily: 'monospace', outline: 'none',
          }}
        />
        {error && <span style={{ color: '#ff6666', fontSize: '12px' }}>{error}</span>}
        <button type="submit" style={{
          background: '#2222aa', border: 'none', color: '#fff',
          padding: '10px', fontSize: '13px', fontFamily: 'monospace',
          cursor: 'pointer', letterSpacing: '2px',
        }}>
          ENTRA
        </button>
      </form>
    </div>
  );
};
