import type { AvatarConfig } from '@social-square/shared';

export interface AccountProfile {
  userId: string;
  username: string;
  petals: number;
  avatarConfig: AvatarConfig;
  provider: 'password' | 'google';
}

export interface AuthConfig {
  googleEnabled: boolean;
  devPasswordLogin: boolean;
}

export async function fetchAuthConfig(): Promise<AuthConfig> {
  const res = await fetch('/api/auth/config');
  if (!res.ok) return { googleEnabled: false, devPasswordLogin: true };
  return res.json() as Promise<AuthConfig>;
}

export async function fetchAccountProfile(token: string): Promise<AccountProfile> {
  const res = await fetch('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('AUTH_REQUIRED');
  return res.json() as Promise<AccountProfile>;
}

export async function adjustAccountPetals(token: string | null, delta: number): Promise<number | null> {
  if (!token) return null;
  const res = await fetch('/api/auth/petals', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ delta }),
  });
  if (!res.ok) return null;
  const data = await res.json() as { petals?: number };
  return typeof data.petals === 'number' ? data.petals : null;
}
