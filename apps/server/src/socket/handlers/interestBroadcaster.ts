import {
  filterObjectsByInterest,
  filterUsersByInterest,
  isObjectVisibleToViewer,
} from '@social-square/shared';
import { moderationService } from '../../services/ModerationService';
import { state, type IoServer, type IoSocket, type RoomObject, type RoomUser } from './roomContext';
import { canSeeUser, changedSector, usersById } from './roomUtils';
import type {
  AvatarState,
  ChatMessage,
  Direction,
  EmoteId,
  HeldItem,
  Position,
  RoomState,
  ServerToClientEvents,
} from '@social-square/shared';

function userJoinedPayload(user: RoomUser): Parameters<ServerToClientEvents['user-joined']>[0] {
  return {
    userId: user.userId,
    avatarConfig: user.avatarConfig,
    position: user.position,
    state: user.state,
    heldItem: user.heldItem ?? null,
  };
}

export function filteredRoomStateForViewer(roomState: RoomState, viewer: RoomUser): RoomState {
  return {
    ...roomState,
    totalUsers: roomState.totalUsers ?? roomState.users.length,
    users: filterUsersByInterest(viewer, roomState.users),
    objects: filterObjectsByInterest(viewer, roomState.objects),
  };
}

export async function emitObjectStateChangedToInterested(
  io: IoServer,
  roomId: string,
  object: RoomObject,
  users?: RoomUser[],
): Promise<void> {
  const roomUsers = users ?? (await state.getRoomState(roomId)).users;
  const byId = usersById(roomUsers);
  const sockets = await io.in(roomId).fetchSockets();

  for (const peer of sockets) {
    const peerId = peer.data.userId;
    if (!peerId) continue;
    const viewer = byId.get(peerId);
    if (viewer && isObjectVisibleToViewer(viewer, object)) peer.emit('object-state-changed', object);
  }
}

export function syncObjectsForViewer(socket: IoSocket, roomState: RoomState, viewer: RoomUser): void {
  for (const object of filterObjectsByInterest(viewer, roomState.objects)) {
    socket.emit('object-state-changed', object);
  }
}

export async function emitUserJoinedToInterested(
  io: IoServer,
  roomId: string,
  joined: RoomUser,
  users: RoomUser[],
): Promise<void> {
  const byId = usersById(users);
  const sockets = await io.in(roomId).fetchSockets();
  for (const peer of sockets) {
    const peerId = peer.data.userId;
    if (!peerId || peerId === joined.userId) continue;
    const viewer = byId.get(peerId);
    if (viewer && canSeeUser(viewer, joined)) peer.emit('user-joined', userJoinedPayload(joined));
  }
}

export async function emitAvatarUpdateToInterested(
  io: IoServer,
  roomId: string,
  updated: RoomUser,
  users: RoomUser[],
): Promise<void> {
  const byId = usersById(users);
  const sockets = await io.in(roomId).fetchSockets();
  for (const peer of sockets) {
    const peerId = peer.data.userId;
    if (!peerId || peerId === updated.userId) continue;
    const viewer = byId.get(peerId);
    if (viewer && canSeeUser(viewer, updated)) {
      peer.emit('user-avatar-updated', {
        userId: updated.userId,
        avatarConfig: updated.avatarConfig,
      });
    }
  }
}

export async function emitUserLeftToInterested(
  io: IoServer,
  roomId: string,
  leaving: RoomUser,
  users: RoomUser[],
): Promise<void> {
  const byId = usersById(users);
  const sockets = await io.in(roomId).fetchSockets();
  for (const peer of sockets) {
    const peerId = peer.data.userId;
    if (!peerId || peerId === leaving.userId) continue;
    const viewer = byId.get(peerId);
    if (viewer && canSeeUser(viewer, leaving)) peer.emit('user-left', { userId: leaving.userId });
  }
}

export async function emitPoseChangeWithInterest(
  io: IoServer,
  socket: IoSocket,
  roomId: string,
  movingUserId: string,
  oldPosition: Position,
  move: { x: number; y: number; direction: Direction; state: AvatarState },
): Promise<void> {
  const roomState = await state.getRoomState(roomId);
  const byId = usersById(roomState.users);
  const mover = byId.get(movingUserId);
  if (!mover) return;

  const oldMover = { ...mover, position: oldPosition };
  const sockets = await io.in(roomId).fetchSockets();

  for (const peerSocket of sockets) {
    const peerId = peerSocket.data.userId;
    if (!peerId || peerId === movingUserId) continue;

    const peer = byId.get(peerId);
    if (!peer) continue;

    const wasMoverVisibleToPeer = canSeeUser(peer, oldMover);
    const isMoverVisibleToPeer = canSeeUser(peer, mover);
    if (isMoverVisibleToPeer) {
      if (wasMoverVisibleToPeer) {
        peerSocket.emit('user-moved', { userId: movingUserId, ...move });
      } else {
        peerSocket.emit('user-joined', userJoinedPayload(mover));
      }
    } else if (wasMoverVisibleToPeer) {
      peerSocket.emit('user-left', { userId: movingUserId });
    }

    const wasPeerVisibleToMover = canSeeUser(oldMover, peer);
    const isPeerVisibleToMover = canSeeUser(mover, peer);
    if (isPeerVisibleToMover && !wasPeerVisibleToMover) {
      socket.emit('user-joined', userJoinedPayload(peer));
    } else if (!isPeerVisibleToMover && wasPeerVisibleToMover) {
      socket.emit('user-left', { userId: peer.userId });
    }
  }

  if (changedSector(oldPosition, mover.position)) syncObjectsForViewer(socket, roomState, mover);
}

export async function emitHeldItemToInterested(
  io: IoServer,
  roomId: string,
  holder: RoomUser,
  item: HeldItem,
  users: RoomUser[],
): Promise<void> {
  const byId = usersById(users);
  const sockets = await io.in(roomId).fetchSockets();
  for (const peer of sockets) {
    const peerId = peer.data.userId;
    if (!peerId || peerId === holder.userId) continue;
    const viewer = byId.get(peerId);
    if (viewer && canSeeUser(viewer, holder)) peer.emit('user-held-item', { userId: holder.userId, item });
  }
}

export async function emitEmoteToInterested(
  io: IoServer,
  roomId: string,
  sender: RoomUser,
  emoteId: EmoteId,
  users: RoomUser[],
): Promise<void> {
  const byId = usersById(users);
  const sockets = await io.in(roomId).fetchSockets();
  for (const peer of sockets) {
    const peerId = peer.data.userId;
    if (!peerId || peerId === sender.userId) continue;
    const viewer = byId.get(peerId);
    if (viewer && canSeeUser(viewer, sender)) peer.emit('user-emote', { userId: sender.userId, emoteId });
  }
}

export async function emitChatToInterested(
  io: IoServer,
  roomId: string,
  sender: RoomUser,
  message: ChatMessage,
  users: RoomUser[],
): Promise<void> {
  const byId = usersById(users);
  const sockets = await io.in(roomId).fetchSockets();
  for (const peer of sockets) {
    const peerId = peer.data.userId;
    if (!peerId) continue;
    if (peerId === sender.userId) {
      peer.emit('user-chat-message', message);
      continue;
    }

    const viewer = byId.get(peerId);
    if (viewer && canSeeUser(viewer, sender) && !(await moderationService.isBlockedBy(peerId, sender.userId))) {
      peer.emit('user-chat-message', message);
    }
  }
}
