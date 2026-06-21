import React, { useState, useRef, useEffect } from 'react';

interface AuthFormProps {
  onSuccess: (userId: string, username: string, token: string) => void;
}

const overlay: React.CSSProperties = {
  position: 'absolute', inset: 0, zIndex: 100,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(10,10,30,0.92)',
  backdropFilter: 'blur(6px)',
  pointerEvents: 'auto',
};

const card: React.CSSProperties = {
  background: 'rgba(26,26,60,0.95)',
  border: '1px solid rgba(100,100,220,0.35)',
  borderRadius: '8px',
  padding: '36px 40px',
  width: '320px',
  fontFamily: 'monospace',
  color: '#e0e0ff',
};

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '10px 12px',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(100,100,200,0.4)',
  borderRadius: '4px',
  color: '#e0e0ff',
  fontFamily: 'monospace',
  fontSize: '14px',
  outline: 'none',
  marginTop: '6px',
};

export const AuthForm: React.FC<AuthFormProps> = ({ onSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = username.trim();
    if (u.length < 2 || u.length > 30) {
      setError('Username: 2-30 caratteri');
      return;
    }
    if (password.length < 4) {
      setError('Password: minimo 4 caratteri');
      return;
    }

    setLoading(true);
    setLoadingMsg('Connessione al server…');
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password }),
      });
      const data = await res.json() as {
        token?: string; userId?: string; username?: string;
        isNew?: boolean; error?: string;
      };

      if (!res.ok || !data.token) {
        setError(data.error ?? 'Errore di autenticazione');
        setLoading(false);
        return;
      }

      setLoadingMsg(data.isNew ? 'Account creato! Entro…' : 'Bentornato! Entro…');
      // Brief pause so user sees the success message before scene transition
      await new Promise((r) => setTimeout(r, 600));
      onSuccess(data.userId!, data.username!, data.token);
    } catch {
      setError('Impossibile contattare il server');
      setLoading(false);
    }
  };

  return (
    <div style={overlay}>
      <div style={card}>
        <h2 style={{ margin: '0 0 6px', fontSize: '18px', color: '#aaaaff' }}>
          Social Square
        </h2>
        <p style={{ margin: '0 0 24px', fontSize: '11px', color: '#555588' }}>
          Prima volta? L'account viene creato automaticamente.
        </p>

        <form onSubmit={handleSubmit}>
          <label style={{ fontSize: '11px', color: '#8888aa' }}>
            Username
            <input
              ref={inputRef}
              style={inputStyle}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="il tuo nome"
              minLength={2}
              maxLength={30}
              autoComplete="username"
              disabled={loading}
            />
          </label>

          <label style={{ fontSize: '11px', color: '#8888aa', display: 'block', marginTop: '14px' }}>
            Password
            <input
              style={inputStyle}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="min 4 caratteri"
              minLength={4}
              autoComplete="current-password"
              disabled={loading}
            />
          </label>

          {error && (
            <p style={{ margin: '10px 0 0', fontSize: '11px', color: '#ff7777' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: '22px', width: '100%', padding: '11px',
              background: loading ? 'rgba(68,255,136,0.08)' : 'rgba(68,255,136,0.2)',
              border: '1px solid rgba(68,255,136,0.5)',
              borderRadius: '4px',
              color: '#44ff88', fontFamily: 'monospace', fontSize: '13px',
              cursor: loading ? 'default' : 'pointer',
              letterSpacing: '0.05em',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}
          >
            {loading && (
              <span style={{
                display: 'inline-block',
                width: '12px', height: '12px',
                border: '2px solid rgba(68,255,136,0.3)',
                borderTopColor: '#44ff88',
                borderRadius: '50%',
                animation: 'spin 0.7s linear infinite',
                flexShrink: 0,
              }} />
            )}
            {loading ? loadingMsg : 'Entra'}
          </button>
        </form>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
};
