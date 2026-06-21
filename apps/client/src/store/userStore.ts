import { create } from 'zustand';
import type { AvatarConfig } from '@social-square/shared';

const TOKEN_KEY = 'ss_token';

interface UserState {
  userId: string | null;
  username: string | null;
  token: string | null;
  avatarConfig: AvatarConfig | null;
  setUser: (userId: string, username: string, token?: string) => void;
  setAvatarConfig: (config: AvatarConfig) => void;
  clearUser: () => void;
}

function loadToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export const useUserStore = create<UserState>((set) => ({
  userId: null,
  username: null,
  token: loadToken(),
  avatarConfig: null,
  setUser: (userId, username, token) => {
    if (token) {
      try { localStorage.setItem(TOKEN_KEY, token); } catch { /* ignore */ }
    }
    set({ userId, username, token: token ?? loadToken() });
  },
  setAvatarConfig: (config) => set({ avatarConfig: config }),
  clearUser: () => {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
    set({ userId: null, username: null, token: null, avatarConfig: null });
  },
}));
