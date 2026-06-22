import { Direction, type AvatarConfig, type AvatarState, type HeldItem, type ObjectState, type RoomState } from '@social-square/shared';
import { useGameStore } from '../../../store/gameStore';

interface RemoteAvatarLike {
  updateTarget: (x: number, y: number, direction: Direction, state: AvatarState) => boolean;
  setHeldItem: (item: HeldItem) => void;
  setAvatarConfig?: (config: AvatarConfig) => void;
}

export interface RoomStateSceneLike {
  _myUserId: string | null;
  _remoteAvatars: Map<string, RemoteAvatarLike>;
  _applyObjectState: (objectId: string, objectState: ObjectState) => void;
  _destroyRemote: (userId: string) => void;
  _setRemoteAvatarActive?: (userId: string, active: boolean) => void;
  _spawnRemote: (
    userId: string,
    username: string,
    worldX: number,
    worldY: number,
    heldItem?: HeldItem,
    state?: AvatarState,
    avatarConfig?: AvatarConfig,
  ) => void;
}

export function applyAuthoritativeRoomState(scene: RoomStateSceneLike, roomState: RoomState): void {
  useGameStore.getState().setUsersInRoom(roomState.totalUsers ?? roomState.users.length);

  roomState.objects.forEach((object) => scene._applyObjectState(object.objectId, object.state));

  const snapshotUserIds = new Set(roomState.users.map((user) => user.userId));
  scene._remoteAvatars.forEach((_avatar, remoteUserId) => {
    if (!snapshotUserIds.has(remoteUserId)) scene._destroyRemote(remoteUserId);
  });

  roomState.users.forEach((user) => {
    if (user.userId === scene._myUserId) return;

    const remote = scene._remoteAvatars.get(user.userId);
    if (remote) {
      scene._setRemoteAvatarActive?.(
        user.userId,
        remote.updateTarget(user.position.x, user.position.y, Direction.SE, user.state),
      );
      remote.setHeldItem(user.heldItem ?? null);
      remote.setAvatarConfig?.(user.avatarConfig);
      return;
    }

    scene._spawnRemote(
      user.userId,
      user.avatarConfig.username,
      user.position.x,
      user.position.y,
      user.heldItem ?? null,
      user.state,
      user.avatarConfig,
    );
  });
}
