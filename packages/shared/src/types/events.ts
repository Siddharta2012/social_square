// Socket.IO event types shared between client and server
import type { ChatMessage } from '../constants/chat';

export interface AvatarConfig {
  userId: string;
  username: string;
  body: number;
  outfit: number;
  hair: number;
  hairColor: string;
  accessory: number;
  expression: number;
}

export type AvatarState = 'idle' | 'walk' | 'sit' | 'wave' | 'dance' | 'clap' | 'fish';
export type EmoteId = 'wave' | 'dance' | 'clap';

/** Item currently held in the avatar's hand. */
export type HeldItem = 'beer' | 'pretzel' | null;

export enum Direction {
  SE = 0,
  S = 1,
  SW = 2,
  W = 3,
  NW = 4,
  N = 5,
  NE = 6,
  E = 7,
}

export interface Position {
  x: number;
  y: number;
}

export type ObjectState = Record<string, unknown>;

export interface RoomState {
  roomId: string;
  /** Total users in the room, even when `users` is interest-filtered. */
  totalUsers?: number;
  users: Array<{
    userId: string;
    avatarConfig: AvatarConfig;
    position: Position;
    state: AvatarState;
    heldItem?: HeldItem;
  }>;
  objects: Array<{
    objectId: string;
    state: ObjectState;
  }>;
}

// Client → Server events
export interface ClientToServerEvents {
  'join-room': (data: { roomId: string; avatarConfig: AvatarConfig }) => void;
  'leave-room': (data: { roomId: string }) => void;
  'move': (data: { x: number; y: number; direction: Direction; state: AvatarState }) => void;
  'interact': (data: { objectId: string; action: string; payload?: ObjectState }) => void;
  'emote': (data: { emoteId: EmoteId }) => void;
  'hold-item': (data: { item: HeldItem }) => void;
  'chat-message': (data: { text: string }) => void;
}

// Server → Client events
export interface ServerToClientEvents {
  'room-state': (data: RoomState) => void;
  'user-joined': (data: {
    userId: string;
    avatarConfig: AvatarConfig;
    position: Position;
    state?: AvatarState;
    heldItem?: HeldItem;
  }) => void;
  'user-left': (data: { userId: string }) => void;
  'user-moved': (data: { userId: string; x: number; y: number; direction: Direction; state: AvatarState }) => void;
  'object-state-changed': (data: { objectId: string; state: ObjectState }) => void;
  'user-emote': (data: { userId: string; emoteId: EmoteId }) => void;
  'user-held-item': (data: { userId: string; item: HeldItem }) => void;
  'user-chat-message': (data: ChatMessage) => void;
  'room-users-count': (data: { roomId: string; count: number }) => void;
  'account-updated': (data: { petals?: number; avatarConfig?: AvatarConfig }) => void;
  'error': (data: { code: string; message: string }) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  userId: string;
  username: string;
  currentRoom?: string;
}
