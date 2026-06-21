// Socket.IO event types shared between client and server

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

export type AvatarState = 'idle' | 'walk' | 'sit' | 'wave' | 'dance' | 'fish';

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
  'interact': (data: { objectId: string; action: string }) => void;
  'emote': (data: { emoteId: string }) => void;
  'hold-item': (data: { item: HeldItem }) => void;
}

// Server → Client events
export interface ServerToClientEvents {
  'room-state': (data: RoomState) => void;
  'user-joined': (data: { userId: string; avatarConfig: AvatarConfig; position: Position }) => void;
  'user-left': (data: { userId: string }) => void;
  'user-moved': (data: { userId: string; x: number; y: number; direction: Direction; state: AvatarState }) => void;
  'object-state-changed': (data: { objectId: string; state: ObjectState }) => void;
  'user-emote': (data: { userId: string; emoteId: string }) => void;
  'user-held-item': (data: { userId: string; item: HeldItem }) => void;
  'room-users-count': (data: { roomId: string; count: number }) => void;
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
