import { create } from 'zustand';
import { CHAT_HISTORY_LIMIT } from '@social-square/shared';
import type { AvatarState, ChatMessage, HeldItem, JukeboxHistoryEntry, JukeboxTrackId, WaiterState } from '@social-square/shared';

export type WorldLoadingState = 'initial' | 'streaming' | null;

export interface JukeboxStatus {
  trackId: JukeboxTrackId;
  title: string;
  playing: boolean;
  blocked: boolean;
  source: 'local' | 'youtube';
  expiresAt: number | null;
  externalUrl?: string;
  requestedBy?: string;
  history?: JukeboxHistoryEntry[];
}

export interface SpeakingUser {
  userId: string;
  username: string;
  distance: number;
  volume: number;
  pan: number;
}

export interface ActionAvailability {
  nearJukebox: boolean;
  nearWaiter: boolean;
  canAffordAction: boolean;
}

export interface UserActionMenu {
  userId: string;
  username: string;
  muted: boolean;
}

export interface WorldDebugMetrics {
  fps: number;
  frameMs: number;
  locationName: string | null;
  routeHint: string | null;
  worldLoading: WorldLoadingState;
  activeSectors: number;
  loadedSectors: number;
  inFlightSectors: number;
  renderedSectors: number;
  worldSectors: number;
  decorations: number;
  lights: number;
  isoObjects: number;
  isoDirty: boolean;
  localTile: string | null;
  extra: Record<string, string | number | boolean | null>;
}

interface GameState {
  isConnected: boolean;
  currentRoomId: string | null;
  roomName: string | null;
  locationName: string | null;
  routeHint: string | null;
  travelTargetName: string | null;
  usersInRoom: number;
  petals: number;
  showUsernameForm: boolean;
  showAuthForm: boolean;
  voiceAvailable: boolean;
  voiceMuted: boolean;
  speakingUsers: SpeakingUser[];
  setConnected: (connected: boolean) => void;
  setCurrentRoom: (roomId: string | null) => void;
  setRoomName: (name: string | null) => void;
  setLocationName: (name: string | null) => void;
  setRouteHint: (hint: string | null) => void;
  setTravelTargetName: (name: string | null) => void;
  setUsersInRoom: (count: number) => void;
  setPetals: (amount: number) => void;
  setShowUsernameForm: (show: boolean) => void;
  setShowAuthForm: (show: boolean) => void;
  setVoiceAvailable: (v: boolean) => void;
  setVoiceMuted: (v: boolean) => void;
  setSpeakingUsers: (users: SpeakingUser[]) => void;
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
  actionAvailability: ActionAvailability;
  setActionAvailability: (availability: ActionAvailability) => void;
  showWorldMap: boolean;
  setShowWorldMap: (show: boolean) => void;
  userActionMenu: UserActionMenu | null;
  setUserActionMenu: (menu: UserActionMenu | null) => void;
  showDebugOverlay: boolean;
  setShowDebugOverlay: (show: boolean) => void;
  toggleDebugOverlay: () => void;
  worldDebugMetrics: WorldDebugMetrics | null;
  setWorldDebugMetrics: (metrics: WorldDebugMetrics | null) => void;
}

export const useGameStore = create<GameState>((set) => ({
  isConnected: false,
  currentRoomId: null,
  roomName: null,
  locationName: null,
  routeHint: null,
  travelTargetName: null,
  usersInRoom: 0,
  petals: 0,
  showUsernameForm: false,
  showAuthForm: false,
  voiceAvailable: false,
  voiceMuted: false,
  speakingUsers: [],
  setConnected: (connected) => set({ isConnected: connected }),
  setCurrentRoom: (roomId) => set({ currentRoomId: roomId }),
  setRoomName: (name) => set({ roomName: name }),
  setLocationName: (name) => set({ locationName: name }),
  setRouteHint: (hint) => set({ routeHint: hint }),
  setTravelTargetName: (name) => set({ travelTargetName: name }),
  setUsersInRoom: (count) => set({ usersInRoom: count }),
  setPetals: (amount) => set({ petals: Math.max(0, Math.floor(amount)) }),
  setShowUsernameForm: (show) => set({ showUsernameForm: show }),
  setShowAuthForm: (show) => set({ showAuthForm: show }),
  setVoiceAvailable: (v) => set({ voiceAvailable: v }),
  setVoiceMuted: (v) => set({ voiceMuted: v }),
  setSpeakingUsers: (users) => set({ speakingUsers: users }),
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
  actionAvailability: {
    nearJukebox: false,
    nearWaiter: false,
    canAffordAction: false,
  },
  setActionAvailability: (availability) => set({ actionAvailability: availability }),
  showWorldMap: false,
  setShowWorldMap: (show) => set({ showWorldMap: show }),
  userActionMenu: null,
  setUserActionMenu: (menu) => set({ userActionMenu: menu }),
  showDebugOverlay: false,
  setShowDebugOverlay: (show) => set({ showDebugOverlay: show }),
  toggleDebugOverlay: () => set((state) => ({ showDebugOverlay: !state.showDebugOverlay })),
  worldDebugMetrics: null,
  setWorldDebugMetrics: (metrics) => set({ worldDebugMetrics: metrics }),
}));
