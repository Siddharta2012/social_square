import { create } from 'zustand';
import { CHAT_HISTORY_LIMIT } from '@social-square/shared';
import type { AvatarState, ChatMessage, HeldItem, JukeboxTrackId, WaiterState } from '@social-square/shared';

export type WorldLoadingState = 'initial' | 'streaming' | null;

export interface JukeboxStatus {
  trackId: JukeboxTrackId;
  title: string;
  playing: boolean;
  blocked: boolean;
}

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
  worldLoading: WorldLoadingState;
  setWorldLoading: (state: WorldLoadingState) => void;
  localAvatarState: AvatarState;
  setLocalAvatarState: (state: AvatarState) => void;
  jukeboxStatus: JukeboxStatus | null;
  setJukeboxStatus: (status: JukeboxStatus | null) => void;
  chatMessages: ChatMessage[];
  addChatMessage: (message: ChatMessage) => void;
  clearChatMessages: () => void;
  waiterStatus: WaiterState | null;
  setWaiterStatus: (status: WaiterState | null) => void;
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
  worldLoading: null,
  setWorldLoading: (state) => set({ worldLoading: state }),
  localAvatarState: 'idle',
  setLocalAvatarState: (state) => set({ localAvatarState: state }),
  jukeboxStatus: null,
  setJukeboxStatus: (status) => set({ jukeboxStatus: status }),
  chatMessages: [],
  addChatMessage: (message) => set((state) => ({
    chatMessages: [...state.chatMessages, message].slice(-CHAT_HISTORY_LIMIT),
  })),
  clearChatMessages: () => set({ chatMessages: [] }),
  waiterStatus: null,
  setWaiterStatus: (status) => set({ waiterStatus: status }),
}));
