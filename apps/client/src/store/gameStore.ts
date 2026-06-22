import { CHAT_HISTORY_LIMIT } from '@social-square/shared';
import { create } from 'zustand';
import type {
  AvatarState,
  ChatMessage,
  HeldItem,
  JukeboxHistoryEntry,
  JukeboxTrackId,
  PoolState,
  UserProgressSnapshot,
  WaiterState,
} from '@social-square/shared';

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

export interface PoolMessage {
  text: string;
  tone: 'info' | 'error';
}

export interface ActionAvailability {
  nearJukebox: boolean;
  nearWaiter: boolean;
  nearPool: boolean;
  canAffordAction: boolean;
  canAffordPool: boolean;
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

function sameActionAvailability(a: ActionAvailability, b: ActionAvailability): boolean {
  return a.nearJukebox === b.nearJukebox &&
    a.nearWaiter === b.nearWaiter &&
    a.nearPool === b.nearPool &&
    a.canAffordAction === b.canAffordAction &&
    a.canAffordPool === b.canAffordPool;
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
  progress: UserProgressSnapshot | null;
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
  setProgress: (progress: UserProgressSnapshot | null) => void;
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
  poolStatus: PoolState | null;
  setPoolStatus: (status: PoolState | null) => void;
  showPoolOverlay: boolean;
  setShowPoolOverlay: (show: boolean) => void;
  poolMessage: PoolMessage | null;
  setPoolMessage: (message: PoolMessage | null) => void;
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
  progress: null,
  showUsernameForm: false,
  showAuthForm: false,
  voiceAvailable: false,
  voiceMuted: false,
  speakingUsers: [],
  setConnected: (connected) => set((state) => state.isConnected === connected ? state : { isConnected: connected }),
  setCurrentRoom: (roomId) => set((state) => state.currentRoomId === roomId ? state : { currentRoomId: roomId }),
  setRoomName: (name) => set((state) => state.roomName === name ? state : { roomName: name }),
  setLocationName: (name) => set((state) => state.locationName === name ? state : { locationName: name }),
  setRouteHint: (hint) => set((state) => state.routeHint === hint ? state : { routeHint: hint }),
  setTravelTargetName: (name) => set((state) => state.travelTargetName === name ? state : { travelTargetName: name }),
  setUsersInRoom: (count) => set((state) => state.usersInRoom === count ? state : { usersInRoom: count }),
  setPetals: (amount) => set((state) => {
    const petals = Math.max(0, Math.floor(amount));
    return state.petals === petals ? state : { petals };
  }),
  setProgress: (progress) => set((state) => state.progress === progress ? state : { progress }),
  setShowUsernameForm: (show) => set((state) => state.showUsernameForm === show ? state : { showUsernameForm: show }),
  setShowAuthForm: (show) => set((state) => state.showAuthForm === show ? state : { showAuthForm: show }),
  setVoiceAvailable: (v) => set((state) => state.voiceAvailable === v ? state : { voiceAvailable: v }),
  setVoiceMuted: (v) => set((state) => state.voiceMuted === v ? state : { voiceMuted: v }),
  setSpeakingUsers: (users) => set((state) => state.speakingUsers === users ? state : { speakingUsers: users }),
  showAudioSettings: false,
  setShowAudioSettings: (v) => set((state) => state.showAudioSettings === v ? state : { showAudioSettings: v }),
  heldItem: null,
  setHeldItem: (item) => set((state) => state.heldItem === item ? state : { heldItem: item }),
  worldLoading: null,
  setWorldLoading: (worldLoading) => set((state) => state.worldLoading === worldLoading ? state : { worldLoading }),
  localAvatarState: 'idle',
  setLocalAvatarState: (localAvatarState) => set((state) => state.localAvatarState === localAvatarState ? state : { localAvatarState }),
  jukeboxStatus: null,
  setJukeboxStatus: (status) => set({ jukeboxStatus: status }),
  poolStatus: null,
  setPoolStatus: (status) => set({ poolStatus: status }),
  showPoolOverlay: false,
  setShowPoolOverlay: (show) => set((state) => state.showPoolOverlay === show ? state : { showPoolOverlay: show }),
  poolMessage: null,
  setPoolMessage: (message) => set({ poolMessage: message }),
  chatMessages: [],
  addChatMessage: (message) => set((state) => ({
    chatMessages: [...state.chatMessages, message].slice(-CHAT_HISTORY_LIMIT),
  })),
  clearChatMessages: () => set((state) => state.chatMessages.length === 0 ? state : { chatMessages: [] }),
  waiterStatus: null,
  setWaiterStatus: (status) => set({ waiterStatus: status }),
  actionAvailability: {
    nearJukebox: false,
    nearWaiter: false,
    nearPool: false,
    canAffordAction: false,
    canAffordPool: false,
  },
  setActionAvailability: (availability) => set((state) => (
    sameActionAvailability(state.actionAvailability, availability) ? state : { actionAvailability: availability }
  )),
  showWorldMap: false,
  setShowWorldMap: (show) => set((state) => state.showWorldMap === show ? state : { showWorldMap: show }),
  userActionMenu: null,
  setUserActionMenu: (menu) => set({ userActionMenu: menu }),
  showDebugOverlay: false,
  setShowDebugOverlay: (show) => set({ showDebugOverlay: show }),
  toggleDebugOverlay: () => set((state) => ({ showDebugOverlay: !state.showDebugOverlay })),
  worldDebugMetrics: null,
  setWorldDebugMetrics: (metrics) => set({ worldDebugMetrics: metrics }),
}));
