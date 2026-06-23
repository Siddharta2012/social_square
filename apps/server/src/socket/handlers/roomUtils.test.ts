import { Direction } from '@social-square/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { state } from './roomContext';
import { currentRoomUserForInteraction, ensureUserNear } from './roomUtils';
import type { AvatarConfig } from '@social-square/shared';

const avatarConfig: AvatarConfig = {
  userId: 'user-test',
  username: 'Tester',
  body: 0,
  outfit: 0,
  hair: 0,
  hairColor: '#4488ff',
  accessory: 0,
  expression: 0,
};

describe('room interaction position hints', () => {
  const roomId = `test-room-utils:${Date.now()}`;
  const userId = 'user-test';

  afterEach(async () => {
    await state.removeUser(roomId, userId);
  });

  it('uses player position hints for immediate interaction checks', async () => {
    await state.addUser(roomId, {
      userId,
      avatarConfig,
      username: 'Tester',
      position: { x: 0, y: 0 },
      state: 'idle',
    });

    const user = await currentRoomUserForInteraction(roomId, userId, {
      playerX: 16,
      playerY: 3,
    });

    expect(user?.position).toEqual({ x: 16, y: 3 });
    // The hint is NOT persisted — the stored position stays at the original value.
    await expect(currentRoomUserForInteraction(roomId, userId)).resolves.toMatchObject({
      position: { x: 0, y: 0 },
    });
  });

  it('lets ensureUserNear validate against a fresh interaction hint', async () => {
    const errors: Array<{ code: string; message: string }> = [];
    await state.addUser(roomId, {
      userId,
      avatarConfig,
      username: 'Tester',
      position: { x: 0, y: 0 },
      state: 'idle',
    });

    const user = await ensureUserNear(
      {
        emit: (event: string, data: { code: string; message: string }) => {
          if (event === 'error') errors.push(data);
        },
      } as never,
      roomId,
      userId,
      { x: 16, y: 3 },
      'Too far',
      { playerX: 16, playerY: 3, direction: Direction.SE },
    );

    expect(user?.position).toEqual({ x: 16, y: 3 });
    expect(errors).toEqual([]);
  });

  it('currentRoomUserForInteraction uses position hint for check only, does not persist it', async () => {
    await state.addUser(roomId, {
      userId,
      avatarConfig,
      username: 'Tester',
      position: { x: 5, y: 5 },
      state: 'idle',
    });

    const updatePositionSpy = vi.spyOn(state, 'updatePosition');

    const user = await currentRoomUserForInteraction(roomId, userId, {
      playerX: 99,
      playerY: 99,
    });

    // The returned user carries the hinted position for proximity checks.
    expect(user?.position).toEqual({ x: 99, y: 99 });

    // The hint must NOT be written back to state — it would let clients
    // teleport their server-side position through interaction payloads.
    expect(updatePositionSpy).not.toHaveBeenCalled();

    updatePositionSpy.mockRestore();
  });
});
