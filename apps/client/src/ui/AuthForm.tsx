import React, { useEffect, useRef, useState } from 'react';
import type { AvatarConfig } from '@social-square/shared';
import { fetchAuthConfig, type AuthConfig } from '../api/account';

interface AuthSuccess {
  userId: string;
  username: string;
  token: string;
  petals: number;
  avatarConfig: AvatarConfig;
}

interface AuthFormProps {
  onSuccess: (data: AuthSuccess) => void;
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
  padding: '32px 36px',
  width: '340px',
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

const buttonStyle: React.CSSProperties = {
  marginTop: '16px',
  width: '100%',
  padding: '11px',
  borderRadius: '4px',
  fontFamily: 'monospace',
  fontSize: '13px',
  cursor: 'pointer',
  letterSpacing: '0.03em',
};

export const AuthForm: React.FC<AuthFormProps> = ({ onSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [config, setConfig] = useState<AuthConfig>({ googleEnabled: true, devPasswordLogin: false });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void fetchAuthConfig().then(setConfig);
    inputRef.current?.focus();
  }, []);

  const handleGoogle = () => {
    setError('');
    setLoading(true);
    setLoadingMsg('Apertura Google...');
    window.location.href = '/api/auth/google/start';
  };

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
    setLoadingMsg('Connessione al server...');
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password }),
      });
      const data = await res.json() as Partial<AuthSuccess> & { isNew?: boolean; error?: string };

      if (!res.ok || !data.token || !data.userId || !data.username || !data.avatarConfig) {
        setError(data.error ?? 'Errore di autenticazione');
        setLoading(false);
        return;
      }

      setLoadingMsg(data.isNew ? 'Account creato! Entro...' : 'Bentornato! Entro...');
      await new Promise((r) => setTimeout(r, 350));
      onSuccess({
        userId: data.userId,
        username: data.username,
        token: data.token,
        petals: data.petals ?? 0,
        avatarConfig: data.avatarConfig,
      });
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
        <p style={{ margin: '0 0 22px', fontSize: '11px', color: '#7777aa', lineHeight: 1.45 }}>
          Accesso richiesto per salvare personaggio e petali.
        </p>

        <button
          type="button"
          disabled={loading || !config.googleEnabled}
          onClick={handleGoogle}
          style={{
            ...buttonStyle,
            marginTop: 0,
            background: config.googleEnabled ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.18)',
            border: '1px solid rgba(255,255,255,0.7)',
            color: '#1f2340',
            cursor: loading || !config.googleEnabled ? 'default' : 'pointer',
          }}
        >
          {loading ? loadingMsg : 'Continua con Google'}
        </button>

        {!config.googleEnabled && (
          <p style={{ margin: '10px 0 0', fontSize: '10px', color: '#ffcc88' }}>
            Google OAuth non configurato nel server.
          </p>
        )}

        {config.devPasswordLogin && (
          <form onSubmit={handleSubmit} style={{ marginTop: '22px', borderTop: '1px solid rgba(150,150,255,0.18)', paddingTop: '18px' }}>
            <label style={{ fontSize: '11px', color: '#8888aa' }}>
              Dev username
              <input
                ref={inputRef}
                style={inputStyle}
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="nome locale"
                minLength={2}
                maxLength={30}
                autoComplete="username"
                disabled={loading}
              />
            </label>

            <label style={{ fontSize: '11px', color: '#8888aa', display: 'block', marginTop: '14px' }}>
              Dev password
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

            <button
              type="submit"
              disabled={loading}
              style={{
                ...buttonStyle,
                background: loading ? 'rgba(68,255,136,0.08)' : 'rgba(68,255,136,0.2)',
                border: '1px solid rgba(68,255,136,0.5)',
                color: '#44ff88',
                cursor: loading ? 'default' : 'pointer',
              }}
            >
              {loading ? loadingMsg : 'Entra in dev'}
            </button>
          </form>
        )}

        {error && (
          <p style={{ margin: '10px 0 0', fontSize: '11px', color: '#ff7777' }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
};
