import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { redis } from '../config/redis';
import type { AvatarConfig } from '@social-square/shared';

const SALT_ROUNDS = 10;
const USER_PREFIX = 'user';
const STARTING_PETALS = 0;

export interface GoogleProfile {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
}

export interface StoredUser {
  userId: string;
  username: string;
  passwordHash?: string;
  provider: 'password' | 'google';
  googleSub?: string;
  email?: string;
  displayName?: string;
  picture?: string;
  avatarConfig?: AvatarConfig;
  petals: number;
  createdAt: number;
  updatedAt: number;
}

export class UserService {
  private usernameKey(username: string): string {
    return `${USER_PREFIX}:${username.toLowerCase()}`;
  }

  private idKey(userId: string): string {
    return `${USER_PREFIX}:id:${userId}`;
  }

  private googleKey(sub: string): string {
    return `${USER_PREFIX}:google:${sub}`;
  }

  async findByUsername(username: string): Promise<StoredUser | null> {
    return this.readUser(this.usernameKey(username));
  }

  async findById(userId: string): Promise<StoredUser | null> {
    return this.readUser(this.idKey(userId));
  }

  async findByGoogleSub(sub: string): Promise<StoredUser | null> {
    const userId = await redis.get(this.googleKey(sub));
    return userId ? this.findById(userId) : null;
  }

  async createPasswordUser(username: string, password: string): Promise<StoredUser> {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const now = Date.now();
    const user = this.withDefaults({
      userId: `user_${now}_${randomUUID().slice(0, 8)}`,
      username,
      passwordHash,
      provider: 'password',
      petals: STARTING_PETALS,
      createdAt: now,
      updatedAt: now,
    });
    await this.saveUser(user);
    return user;
  }

  async loginOrCreateGoogleUser(profile: GoogleProfile): Promise<{ user: StoredUser; isNew: boolean }> {
    const existing = await this.findByGoogleSub(profile.sub);
    if (existing) {
      const next = this.withDefaults({
        ...existing,
        email: profile.email ?? existing.email,
        displayName: profile.name ?? existing.displayName,
        picture: profile.picture ?? existing.picture,
        updatedAt: Date.now(),
      });
      await this.saveUser(next);
      return { user: next, isNew: false };
    }

    const now = Date.now();
    const username = await this.uniqueUsername(profile.name ?? profile.email?.split('@')[0] ?? 'Giocatore');
    const user = this.withDefaults({
      userId: `google_${profile.sub}`,
      username,
      provider: 'google',
      googleSub: profile.sub,
      email: profile.email,
      displayName: profile.name,
      picture: profile.picture,
      petals: STARTING_PETALS,
      createdAt: now,
      updatedAt: now,
    });
    await this.saveUser(user);
    return { user, isNew: true };
  }

  async verifyPassword(user: StoredUser, password: string): Promise<boolean> {
    return typeof user.passwordHash === 'string' && bcrypt.compare(password, user.passwordHash);
  }

  /** Register if new user, login if existing. Returns user or null on bad password. */
  async loginOrRegister(
    username: string,
    password: string,
  ): Promise<{ user: StoredUser; isNew: boolean } | null> {
    const existing = await this.findByUsername(username);
    if (!existing) {
      const user = await this.createPasswordUser(username, password);
      return { user, isNew: true };
    }
    const ok = await this.verifyPassword(existing, password);
    return ok ? { user: this.withDefaults(existing), isNew: false } : null;
  }

  async updateAvatarConfig(userId: string, avatarConfig: AvatarConfig): Promise<StoredUser | null> {
    const user = await this.findById(userId);
    if (!user) return null;
    const next = this.withDefaults({
      ...user,
      avatarConfig: {
        ...avatarConfig,
        userId: user.userId,
        username: user.username,
      },
      updatedAt: Date.now(),
    });
    await this.saveUser(next);
    return next;
  }

  async adjustPetals(userId: string, delta: number): Promise<StoredUser | null> {
    const user = await this.findById(userId);
    if (!user) return null;
    const amount = Math.trunc(delta);
    const nextPetals = Math.max(0, (user.petals ?? 0) + amount);
    const next = this.withDefaults({
      ...user,
      petals: nextPetals,
      updatedAt: Date.now(),
    });
    await this.saveUser(next);
    return next;
  }

  async spendPetals(userId: string, amount: number): Promise<StoredUser | null> {
    const cost = Math.max(0, Math.trunc(amount));
    const user = await this.findById(userId);
    if (!user || (user.petals ?? 0) < cost) return null;
    return this.adjustPetals(userId, -cost);
  }

  private async readUser(key: string): Promise<StoredUser | null> {
    const raw = await redis.get(key);
    if (!raw) return null;
    const user = this.withDefaults(JSON.parse(raw) as Partial<StoredUser>);
    await this.saveUser(user);
    return user;
  }

  private async saveUser(user: StoredUser): Promise<void> {
    const value = JSON.stringify(user);
    await redis.set(this.idKey(user.userId), value);
    await redis.set(this.usernameKey(user.username), value);
    if (user.googleSub) await redis.set(this.googleKey(user.googleSub), user.userId);
  }

  private withDefaults(raw: Partial<StoredUser>): StoredUser {
    const now = Date.now();
    return {
      userId: raw.userId ?? `user_${now}_${randomUUID().slice(0, 8)}`,
      username: raw.username ?? 'Giocatore',
      passwordHash: raw.passwordHash,
      provider: raw.provider ?? (raw.googleSub ? 'google' : 'password'),
      googleSub: raw.googleSub,
      email: raw.email,
      displayName: raw.displayName,
      picture: raw.picture,
      avatarConfig: raw.avatarConfig,
      petals: typeof raw.petals === 'number' ? Math.max(0, Math.trunc(raw.petals)) : STARTING_PETALS,
      createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
      updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : now,
    };
  }

  private async uniqueUsername(input: string): Promise<string> {
    const base = this.cleanUsername(input);
    let candidate = base;
    for (let i = 2; i < 1000; i++) {
      if (!(await this.findByUsername(candidate))) return candidate;
      candidate = `${base}${i}`;
    }
    return `${base}${Date.now().toString(36)}`;
  }

  private cleanUsername(input: string): string {
    const cleaned = input
      .normalize('NFKD')
      .replace(/[^\w ]+/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 24);
    return cleaned.length >= 2 ? cleaned : 'Giocatore';
  }
}
