import { Direction, type AvatarConfig, type AvatarState, type HeldItem, type RoomState } from '@social-square/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../../../store/gameStore';
import { applyAuthoritativeRoomState, type RoomStateSceneLike } from './roomStateReconciler';

function avatarConfig(userId: string, username: string): AvatarConfig {
  return {
    userId,
    username,
    body: 0,
    outfit: 0,
    hair: 0,
    hairColor: '#4488ff',
    accessory: 0,
    expression: 0,
  };
}

function roomUser(
  userId: string,
  username: string,
  x: number,
  y: number,
  state: AvatarState = 'idle',
  heldItem: HeldItem = null,
): RoomState['users'][number] {
  return {
    userId,
    avatarConfig: avatarConfig(userId, username),
    position: { x, y },
    state,
    heldItem,
  };
}

function remoteDouble() {
  return {
    updateTarget: vi.fn(() => false),
    setHeldItem: vi.fn(),
    setAvatarConfig: vi.fn(),
  };
}

describe('applyAuthoritativeRoomState', () => {
  beforeEach(() => {
    useGameStore.getState().setUsersInRoom(0);
  });

  it('reconciles a reconnect snapshot without leaving ghost avatars', () => {
    const staleRemote = remoteDouble();
    const returningRemote = remoteDouble();
    const remotes = new Map([
      ['stale-user', staleRemote],
      ['returning-user', returningRemote],
    ]);
    const applyObjectState = vi.fn();
    const destroyRemote = vi.fn((userId: string) => {
      remotes.delete(userId);
    });
    const spawnRemote = vi.fn((userId: string) => {
      remotes.set(userId, remoteDouble());
    });
    const setRemoteAvatarActive = vi.fn();
    const scene: RoomStateSceneLike = {
      _myUserId: 'local-user',
      _remoteAvatars: remotes,
      _applyObjectState: applyObjectState,
      _destroyRemote: destroyRemote,
      _setRemoteAvatarActive: setRemoteAvatarActive,
      _spawnRemote: spawnRemote,
    };
    const snapshot: RoomState = {
      roomId: 'bar',
      totalUsers: 4,
      users: [
        roomUser('local-user', 'Local', 9, 14),
        roomUser('returning-user', 'Return', 12, 13, 'walk', 'pretzel'),
        roomUser('new-user', 'New', 3, 5, 'idle', 'beer'),
      ],
      objects: [
        { objectId: 'seat:1', state: { occupiedBy: 'returning-user' } },
      ],
    };

    applyAuthoritativeRoomState(scene, snapshot);

    expect(useGameStore.getState().usersInRoom).toBe(4);
    expect(applyObjectState).toHaveBeenCalledWith('seat:1', { occupiedBy: 'returning-user' });
    expect(destroyRemote).toHaveBeenCalledWith('stale-user');
    expect(remotes.has('stale-user')).toBe(false);
    expect(returningRemote.updateTarget).toHaveBeenCalledWith(12, 13, Direction.SE, 'walk');
    expect(setRemoteAvatarActive).toHaveBeenCalledWith('returning-user', false);
    expect(returningRemote.setHeldItem).toHaveBeenCalledWith('pretzel');
    expect(returningRemote.setAvatarConfig).toHaveBeenCalledWith(avatarConfig('returning-user', 'Return'));
    expect(spawnRemote).toHaveBeenCalledWith('new-user', 'New', 3, 5, 'beer', 'idle', avatarConfig('new-user', 'New'));
    expect(spawnRemote).not.toHaveBeenCalledWith('local-user', expect.anything(), expect.anything(), expect.anything(), expect.anything(), expect.anything());
  });
});
