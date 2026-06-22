import { io, Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  AvatarConfig,
  AvatarState,
  ChatMessage,
  Direction,
  EmoteId,
  HeldItem,
  ObjectState,
  Position,
  RoomState,
} from '@social-square/shared';
import { SOCKET_URL, MOVE_EMIT_INTERVAL } from '../config/constants';

type NetworkSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface NetworkCallbacks {
  onConnect?: (socketId: string) => void;
  onDisconnect?: () => void;
  onRoomState?: (state: RoomState) => void;
  onUserJoined?: (data: {
    userId: string;
    avatarConfig: AvatarConfig;
    position: Position;
    state?: AvatarState;
    heldItem?: HeldItem;
  }) => void;
  onUserLeft?: (data: { userId: string }) => void;
  onUserMoved?: (data: {
    userId: string;
    x: number;
    y: number;
    direction: Direction;
    state: AvatarState;
  }) => void;
  onRoomUsersCount?: (data: { roomId: string; count: number }) => void;
  onUserHeldItem?: (data: { userId: string; item: HeldItem }) => void;
  onObjectStateChanged?: (data: { objectId: string; state: ObjectState }) => void;
  onUserEmote?: (data: { userId: string; emoteId: EmoteId }) => void;
  onUserChatMessage?: (data: ChatMessage) => void;
  onAccountUpdated?: (data: { petals?: number; avatarConfig?: AvatarConfig }) => void;
  onError?: (data: { code: string; message: string }) => void;
}

export class NetworkSystem {
  private _socket: NetworkSocket | null = null;
  private _callbacks: NetworkCallbacks = {};
  private _lastMoveEmit = 0;

  connect(username: string, token?: string): void {
    if (this._socket?.connected) return;

    this._socket = io(SOCKET_URL, {
      auth: token ? { token } : { username },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    }) as NetworkSocket;

    this._socket.on('connect', () => {
      console.log('[Network] Connected:', this._socket!.id);
      this._callbacks.onConnect?.(this._socket!.id!);
    });

    this._socket.on('disconnect', (reason) => {
      console.log('[Network] Disconnected:', reason);
      this._callbacks.onDisconnect?.();
    });

    this._socket.on('room-state', (data) => this._callbacks.onRoomState?.(data));
    this._socket.on('user-joined', (data) => this._callbacks.onUserJoined?.(data));
    this._socket.on('user-left', (data) => this._callbacks.onUserLeft?.(data));
    this._socket.on('user-moved', (data) => this._callbacks.onUserMoved?.(data));
    this._socket.on('room-users-count', (data) => this._callbacks.onRoomUsersCount?.(data));
    this._socket.on('user-held-item', (data) => this._callbacks.onUserHeldItem?.(data));
    this._socket.on('object-state-changed', (data) => this._callbacks.onObjectStateChanged?.(data));
    this._socket.on('user-emote', (data) => this._callbacks.onUserEmote?.(data));
    this._socket.on('user-chat-message', (data) => this._callbacks.onUserChatMessage?.(data));
    this._socket.on('account-updated', (data) => this._callbacks.onAccountUpdated?.(data));
    this._socket.on('error', (data) => this._callbacks.onError?.(data));
  }

  setCallbacks(callbacks: NetworkCallbacks): void {
    this._callbacks = callbacks;
  }

  get isConnected(): boolean {
    return this._socket?.connected ?? false;
  }

  get socketId(): string | undefined {
    return this._socket?.id;
  }

  joinRoom(roomId: string, avatarConfig: AvatarConfig): void {
    this._socket?.emit('join-room', { roomId, avatarConfig });
  }

  leaveRoom(roomId: string): void {
    this._socket?.emit('leave-room', { roomId });
  }

  emitHoldItem(item: HeldItem): void {
    this._socket?.emit('hold-item', { item });
  }

  emitInteract(objectId: string, action: string, payload?: ObjectState): void {
    this._socket?.emit('interact', { objectId, action, payload });
  }

  emitEmote(emoteId: EmoteId): void {
    this._socket?.emit('emote', { emoteId });
  }

  emitChatMessage(text: string): void {
    this._socket?.emit('chat-message', { text });
  }

  /** Throttled to MOVE_EMIT_INTERVAL ms. */
  emitMove(x: number, y: number, direction: Direction, state: AvatarState, force = false): void {
    const now = Date.now();
    if (!force && now - this._lastMoveEmit < MOVE_EMIT_INTERVAL) return;
    this._lastMoveEmit = now;
    this._socket?.emit('move', { x, y, direction, state });
  }

  disconnect(): void {
    this._socket?.disconnect();
    this._socket = null;
  }
}
