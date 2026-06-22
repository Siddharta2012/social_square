import type { AvatarConfig } from '@social-square/shared';

export interface AccountStats {
  petalsEarned: number;
  petalsSpent: number;
  flowerPetalsCollected: number;
  dailyPresenceClaims: number;
  barEventsCompleted: number;
  miniTasksCompleted: number;
  itemsPurchased: number;
  waiterOrders: number;
  jukeboxPlays: number;
  poolPlays: number;
  lastPetalCollectAt: number;
  lastDailyPresenceAt: number;
  lastSeenAt: number;
}

export interface AccountProfile {
  userId: string;
  username: string;
  petals: number;
  avatarConfig: AvatarConfig;
  position?: { roomId: string; x: number; y: number; locationId?: string; updatedAt: number } | null;
  unlockedItems: string[];
  stats: AccountStats;
  provider: 'password' | 'google';
  email?: string;
  displayName?: string;
  picture?: string;
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
  const res = await fetch('/api/auth/profile', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('AUTH_REQUIRED');
  return res.json() as Promise<AccountProfile>;
}

export async function saveAccountAvatar(token: string | null, avatarConfig: AvatarConfig): Promise<AccountProfile | null> {
  if (!token) return null;
  const res = await fetch('/api/auth/profile/avatar', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ avatarConfig }),
  });
  if (!res.ok) return null;
  return res.json() as Promise<AccountProfile>;
}

export async function claimDailyPresence(token: string | null): Promise<{ awarded: boolean; petals: number; stats: AccountStats; nextAt: number } | null> {
  if (!token) return null;
  const res = await fetch('/api/auth/profile/daily', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json() as Promise<{ awarded: boolean; petals: number; stats: AccountStats; nextAt: number }>;
}

export async function logoutAccount(token: string | null): Promise<void> {
  if (!token) return;
  await fetch('/api/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => undefined);
}
