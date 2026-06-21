import bcrypt from 'bcryptjs';
import { redis } from '../config/redis';

const SALT_ROUNDS = 10;
const USER_PREFIX = 'user';

export interface StoredUser {
  userId: string;
  username: string;
  passwordHash: string;
  createdAt: number;
}

export class UserService {
  private key(username: string): string {
    return `${USER_PREFIX}:${username.toLowerCase()}`;
  }

  async findByUsername(username: string): Promise<StoredUser | null> {
    const raw = await redis.get(this.key(username));
    return raw ? (JSON.parse(raw) as StoredUser) : null;
  }

  async createUser(username: string, password: string): Promise<StoredUser> {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user: StoredUser = {
      userId: `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      username,
      passwordHash,
      createdAt: Date.now(),
    };
    await redis.set(this.key(username), JSON.stringify(user));
    return user;
  }

  async verifyPassword(user: StoredUser, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }

  /** Register if new user, login if existing. Returns user or null on bad password. */
  async loginOrRegister(
    username: string,
    password: string,
  ): Promise<{ user: StoredUser; isNew: boolean } | null> {
    const existing = await this.findByUsername(username);
    if (!existing) {
      const user = await this.createUser(username, password);
      return { user, isNew: true };
    }
    const ok = await this.verifyPassword(existing, password);
    return ok ? { user: existing, isNew: false } : null;
  }
}
