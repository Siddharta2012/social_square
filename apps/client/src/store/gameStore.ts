import { create } from 'zustand';
import type { HeldItem } from '@social-square/shared';

interface GameState {
  isConnected: boolean;
  currentRoomId: string | null;
  roomName: string | null;
  usersInRoom: number;
  showUsernameForm: boolean;
  showAuthForm: boolean;
  voiceAvailable: boolean;
  voiceMuted: boolean;
  setConnected: (connected: boolean) => void;
  setCurrentRoom: (roomId: string | null) => void;
  setRoomName: (name: string | null) => void;
  setUsersInRoom: (count: number) => void;
  setShowUsernameForm: (show: boolean) => void;
  setShowAuthForm: (show: boolean) => void;
  setVoiceAvailable: (v: boolean) => void;
  setVoiceMuted: (v: boolean) => void;
  showAudioSettings: boolean;
  setShowAudioSettings: (v: boolean) => void;
  heldItem: HeldItem;
  setHeldItem: (item: HeldItem) => void;
}

export const useGameStore = create<GameState>((set) => ({
  isConnected: false,
  currentRoomId: null,
  roomName: null,
  usersInRoom: 0,
  showUsernameForm: false,
  showAuthForm: false,
  voiceAvailable: false,
  voiceMuted: false,
  setConnected: (connected) => set({ isConnected: connected }),
  setCurrentRoom: (roomId) => set({ currentRoomId: roomId }),
  setRoomName: (name) => set({ roomName: name }),
  setUsersInRoom: (count) => set({ usersInRoom: count }),
  setShowUsernameForm: (show) => set({ showUsernameForm: show }),
  setShowAuthForm: (show) => set({ showAuthForm: show }),
  setVoiceAvailable: (v) => set({ voiceAvailable: v }),
  setVoiceMuted: (v) => set({ voiceMuted: v }),
  showAudioSettings: false,
  setShowAudioSettings: (v) => set({ showAudioSettings: v }),
  heldItem: null,
  setHeldItem: (item) => set({ heldItem: item }),
}));
