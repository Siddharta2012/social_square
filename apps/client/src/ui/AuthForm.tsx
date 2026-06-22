import React, { useEffect, useRef, useState } from 'react';
import { fetchAuthConfig, type AuthConfig } from '../api/account';
import { t } from '../i18n';
import type { AvatarConfig, UserProgressSnapshot } from '@social-square/shared';

interface AuthSuccess {
  userId: string;
  username: string;
  token: string;
  petals: number;
  avatarConfig: AvatarConfig;
  unlockedItems?: string[];
  progress?: UserProgressSnapshot | null;
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
  const [config, setConfig] = useState<AuthConfig>({ googleEnabled: false, devPasswordLogin: false });
  const [configLoading, setConfigLoading] = useState(true);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [tosAccepted, setTosAccepted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const consentReady = ageConfirmed && tosAccepted;

  useEffect(() => {
    void fetchAuthConfig()
      .then(setConfig)
      .finally(() => setConfigLoading(false));
    inputRef.current?.focus();
  }, []);

  const handleGoogle = () => {
    if (!config.googleEnabled) {
      setError('Google OAuth non configurato nel server');
      return;
    }
    if (!consentReady) {
      setError('Conferma eta e condizioni per continuare');
      return;
    }
    setError('');
    setLoading(true);
    setLoadingMsg('Apertura Google...');
    window.location.href = '/api/auth/google/start?age=1&tos=1';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = username.trim();
    if (u.length < 2 || u.length > 30) {
      setError('Username: 2-30 caratteri');
      return;
    }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setError('Password: minimo 8 caratteri, lettere e numeri');
      return;
    }
    if (mode === 'register' && !consentReady) {
      setError('Conferma eta e condizioni per registrarti');
      return;
    }

    setLoading(true);
    setLoadingMsg('Connessione al server...');
    setError('');

    try {
      const res = await fetch(`/api/auth/${mode === 'register' ? 'register' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'register'
          ? { username: u, password, ageConfirmed, tosAccepted }
          : { username: u, password }),
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
        unlockedItems: data.unlockedItems,
        progress: data.progress ?? null,
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
          {t('auth.requiredSave')}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
          <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '10px', color: '#aaaadd', lineHeight: 1.35 }}>
            <input
              type="checkbox"
              checked={ageConfirmed}
              onChange={(e) => setAgeConfirmed(e.target.checked)}
              disabled={loading}
              style={{ marginTop: '1px' }}
            />
            <span>Confermo di avere almeno 13 anni.</span>
          </label>
          <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '10px', color: '#aaaadd', lineHeight: 1.35 }}>
            <input
              type="checkbox"
              checked={tosAccepted}
              onChange={(e) => setTosAccepted(e.target.checked)}
              disabled={loading}
              style={{ marginTop: '1px' }}
            />
            <span>Accetto le condizioni d&apos;uso e il trattamento essenziale dei dati.</span>
          </label>
        </div>

        <button
          type="button"
          disabled={loading || configLoading || !config.googleEnabled}
          onClick={handleGoogle}
          style={{
            ...buttonStyle,
            marginTop: 0,
            background: config.googleEnabled ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.18)',
            border: '1px solid rgba(255,255,255,0.7)',
            color: '#1f2340',
            cursor: loading || configLoading || !config.googleEnabled ? 'default' : 'pointer',
          }}
        >
          {loading ? loadingMsg : configLoading ? 'Verifico Google...' : 'Continua con Google'}
        </button>

        {!config.googleEnabled && (
          <p style={{ margin: '10px 0 0', fontSize: '10px', color: '#ffcc88' }}>
            Google OAuth non configurato nel server.
          </p>
        )}

        {config.devPasswordLogin && (
          <form onSubmit={handleSubmit} style={{ marginTop: '22px', borderTop: '1px solid rgba(150,150,255,0.18)', paddingTop: '18px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '14px' }}>
              <button
                type="button"
                onClick={() => setMode('login')}
                style={{
                  ...buttonStyle,
                  marginTop: 0,
                  background: mode === 'login' ? 'rgba(68,255,136,0.2)' : 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(68,255,136,0.35)',
                  color: '#dfffee',
                }}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => setMode('register')}
                style={{
                  ...buttonStyle,
                  marginTop: 0,
                  background: mode === 'register' ? 'rgba(68,255,136,0.2)' : 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(68,255,136,0.35)',
                  color: '#dfffee',
                }}
              >
                Registrati
              </button>
            </div>
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
                placeholder="min 8, lettere e numeri"
                minLength={8}
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
              {loading ? loadingMsg : t('auth.devEnter')}
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
