import { redis } from '../config/redis';
import type { AvatarConfig, AvatarState, Position, RoomState } from '@social-square/shared';

interface UserState {
  userId: string;
  username: string;
  avatarConfig: AvatarConfig;
  position: Position;
  state: AvatarState;
}

const TTL = 3600; // 1 hour — auto-cleanup if server crashes

export class StateService {
  private key(roomId: string): string {
    return `room:${roomId}:users`;
  }

  async addUser(roomId: string, userState: UserState): Promise<void> {
    const k = this.key(roomId);
    await redis.hset(k, userState.userId, JSON.stringify(userState));
    await redis.expire(k, TTL);
  }

  async removeUser(roomId: string, userId: string): Promise<void> {
    await redis.hdel(this.key(roomId), userId);
  }

  async updatePosition(roomId: string, userId: string, position: Position): Promise<void> {
    const k = this.key(roomId);
    const raw = await redis.hget(k, userId);
    if (!raw) return;
    const userState: UserState = JSON.parse(raw);
    userState.position = position;
    await redis.hset(k, userId, JSON.stringify(userState));
  }

  async getRoomState(roomId: string): Promise<RoomState> {
    const raw = await redis.hgetall(this.key(roomId));
    const users = Object.values(raw ?? {}).map((v) => JSON.parse(v) as UserState);
    return { roomId, users, objects: [] };
  }

  async getUserCount(roomId: string): Promise<number> {
    return redis.hlen(this.key(roomId));
  }
}
