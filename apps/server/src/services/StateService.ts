import { redis } from '../config/redis';
import type { AvatarConfig, AvatarState, HeldItem, ObjectState, Position, RoomState } from '@social-square/shared';

interface UserState {
  userId: string;
  username: string;
  avatarConfig: AvatarConfig;
  position: Position;
  state: AvatarState;
  heldItem?: HeldItem;
}

const TTL = 3600; // 1 hour — auto-cleanup if server crashes

export class StateService {
  private userKey(roomId: string): string {
    return `room:${roomId}:users`;
  }

  private objectKey(roomId: string): string {
    return `room:${roomId}:objects`;
  }

  private petalCollectKey(userId: string, locationId: string, pointKey: string): string {
    return `wallet:petal:${userId}:${locationId}:${pointKey}`;
  }

  private async touchRoomUsers(roomId: string): Promise<void> {
    await redis.expire(this.userKey(roomId), TTL);
  }

  private async touchRoomObjects(roomId: string): Promise<void> {
    await redis.expire(this.objectKey(roomId), TTL);
  }

  async addUser(roomId: string, userState: UserState): Promise<void> {
    const k = this.userKey(roomId);
    await redis.hset(k, userState.userId, JSON.stringify(userState));
    await this.touchRoomUsers(roomId);
  }

  async removeUser(roomId: string, userId: string): Promise<void> {
    const users = this.userKey(roomId);
    await redis.hdel(users, userId);
    if (await redis.hlen(users) === 0) {
      await redis.del(users);
      await redis.del(this.objectKey(roomId));
    }
  }

  async updatePosition(roomId: string, userId: string, position: Position): Promise<void> {
    const k = this.userKey(roomId);
    const raw = await redis.hget(k, userId);
    if (!raw) return;
    const userState: UserState = JSON.parse(raw);
    userState.position = position;
    await redis.hset(k, userId, JSON.stringify(userState));
    await this.touchRoomUsers(roomId);
  }

  async updatePose(roomId: string, userId: string, position: Position, avatarState: AvatarState): Promise<void> {
    const k = this.userKey(roomId);
    const raw = await redis.hget(k, userId);
    if (!raw) return;
    const userState: UserState = JSON.parse(raw);
    userState.position = position;
    userState.state = avatarState;
    await redis.hset(k, userId, JSON.stringify(userState));
    await this.touchRoomUsers(roomId);
  }

  async updateAvatarState(roomId: string, userId: string, avatarState: AvatarState): Promise<void> {
    const k = this.userKey(roomId);
    const raw = await redis.hget(k, userId);
    if (!raw) return;
    const userState: UserState = JSON.parse(raw);
    userState.state = avatarState;
    await redis.hset(k, userId, JSON.stringify(userState));
    await this.touchRoomUsers(roomId);
  }

  async updateAvatarConfig(roomId: string, userId: string, avatarConfig: AvatarConfig): Promise<void> {
    const k = this.userKey(roomId);
    const raw = await redis.hget(k, userId);
    if (!raw) return;
    const userState: UserState = JSON.parse(raw);
    userState.avatarConfig = avatarConfig;
    await redis.hset(k, userId, JSON.stringify(userState));
    await this.touchRoomUsers(roomId);
  }

  async updateHeldItem(roomId: string, userId: string, heldItem: HeldItem): Promise<void> {
    const k = this.userKey(roomId);
    const raw = await redis.hget(k, userId);
    if (!raw) return;
    const userState: UserState = JSON.parse(raw);
    userState.heldItem = heldItem;
    await redis.hset(k, userId, JSON.stringify(userState));
    await this.touchRoomUsers(roomId);
  }

  async getObjectState(roomId: string, objectId: string): Promise<ObjectState | null> {
    const raw = await redis.hget(this.objectKey(roomId), objectId);
    return raw ? JSON.parse(raw) as ObjectState : null;
  }

  async updateObjectState(roomId: string, objectId: string, objectState: ObjectState): Promise<void> {
    const k = this.objectKey(roomId);
    await redis.hset(k, objectId, JSON.stringify(objectState));
    await this.touchRoomObjects(roomId);
  }

  async clearObjectOccupancy(roomId: string, userId: string): Promise<Array<{ objectId: string; state: ObjectState }>> {
    const k = this.objectKey(roomId);
    const raw = await redis.hgetall(k);
    const cleared: Array<{ objectId: string; state: ObjectState }> = [];

    for (const [objectId, value] of Object.entries(raw ?? {})) {
      const objectState = JSON.parse(value) as ObjectState;
      if (objectState.occupiedBy !== userId) continue;
      const nextState: ObjectState = {
        ...objectState,
        occupiedBy: null,
        updatedAt: Date.now(),
      };
      await redis.hset(k, objectId, JSON.stringify(nextState));
      cleared.push({ objectId, state: nextState });
    }

    if (cleared.length > 0) await redis.expire(k, TTL);
    return cleared;
  }

  async getRoomState(roomId: string): Promise<RoomState> {
    const rawUsers = await redis.hgetall(this.userKey(roomId));
    const rawObjects = await redis.hgetall(this.objectKey(roomId));
    const users = Object.values(rawUsers ?? {}).map((v) => JSON.parse(v) as UserState);
    const objects = Object.entries(rawObjects ?? {}).map(([objectId, value]) => ({
      objectId,
      state: JSON.parse(value) as ObjectState,
    }));
    return { roomId, users, objects };
  }

  async getUserCount(roomId: string): Promise<number> {
    return redis.hlen(this.userKey(roomId));
  }

  async findUserPresence(userId: string): Promise<{
    userId: string;
    username: string;
    roomId: string;
    position: Position;
  } | null> {
    const keys = await redis.keys('room:*:users');
    for (const key of keys) {
      const raw = await redis.hget(key, userId);
      if (!raw) continue;
      const userState: UserState = JSON.parse(raw);
      return {
        userId: userState.userId,
        username: userState.username,
        roomId: key.slice('room:'.length, -':users'.length),
        position: userState.position,
      };
    }
    return null;
  }

  async reservePetalCollect(
    userId: string,
    locationId: string,
    pointKey: string,
    cooldownMs: number,
  ): Promise<boolean> {
    const key = this.petalCollectKey(userId, locationId, pointKey);
    const existing = await redis.get(key);
    if (existing) return false;
    await redis.set(key, '1', 'PX', Math.max(1000, Math.trunc(cooldownMs)));
    return true;
  }
}
