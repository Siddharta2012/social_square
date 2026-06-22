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

  async addUser(roomId: string, userState: UserState): Promise<void> {
    const k = this.userKey(roomId);
    await redis.hset(k, userState.userId, JSON.stringify(userState));
    await redis.expire(k, TTL);
  }

  async removeUser(roomId: string, userId: string): Promise<void> {
    await redis.hdel(this.userKey(roomId), userId);
  }

  async updatePosition(roomId: string, userId: string, position: Position): Promise<void> {
    const k = this.userKey(roomId);
    const raw = await redis.hget(k, userId);
    if (!raw) return;
    const userState: UserState = JSON.parse(raw);
    userState.position = position;
    await redis.hset(k, userId, JSON.stringify(userState));
  }

  async updatePose(roomId: string, userId: string, position: Position, avatarState: AvatarState): Promise<void> {
    const k = this.userKey(roomId);
    const raw = await redis.hget(k, userId);
    if (!raw) return;
    const userState: UserState = JSON.parse(raw);
    userState.position = position;
    userState.state = avatarState;
    await redis.hset(k, userId, JSON.stringify(userState));
  }

  async updateAvatarState(roomId: string, userId: string, avatarState: AvatarState): Promise<void> {
    const k = this.userKey(roomId);
    const raw = await redis.hget(k, userId);
    if (!raw) return;
    const userState: UserState = JSON.parse(raw);
    userState.state = avatarState;
    await redis.hset(k, userId, JSON.stringify(userState));
  }

  async updateHeldItem(roomId: string, userId: string, heldItem: HeldItem): Promise<void> {
    const k = this.userKey(roomId);
    const raw = await redis.hget(k, userId);
    if (!raw) return;
    const userState: UserState = JSON.parse(raw);
    userState.heldItem = heldItem;
    await redis.hset(k, userId, JSON.stringify(userState));
  }

  async getObjectState(roomId: string, objectId: string): Promise<ObjectState | null> {
    const raw = await redis.hget(this.objectKey(roomId), objectId);
    return raw ? JSON.parse(raw) as ObjectState : null;
  }

  async updateObjectState(roomId: string, objectId: string, objectState: ObjectState): Promise<void> {
    const k = this.objectKey(roomId);
    await redis.hset(k, objectId, JSON.stringify(objectState));
    await redis.expire(k, TTL);
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
