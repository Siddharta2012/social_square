import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { redis } from '../config/redis';
import { DAILY_PRESENCE_REWARD } from '@social-square/shared';
import type { AvatarConfig, Position } from '@social-square/shared';

const SALT_ROUNDS = 10;
const USER_PREFIX = 'user';
const STARTING_PETALS = 0;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface StoredProfilePosition extends Position {
  roomId: string;
  locationId?: string;
  updatedAt: number;
}

export interface StoredUserStats {
  petalsEarned: number;
  petalsSpent: number;
  flowerPetalsCollected: number;
  dailyPresenceClaims: number;
  barEventsCompleted: number;
  miniTasksCompleted: number;
  itemsPurchased: number;
  waiterOrders: number;
  jukeboxPlays: number;
  lastPetalCollectAt: number;
  lastDailyPresenceAt: number;
  lastSeenAt: number;
}

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
  position?: StoredProfilePosition;
  unlockedItems: string[];
  stats: StoredUserStats;
  petals: number;
  createdAt: number;
  updatedAt: number;
  migratedFromUserId?: string;
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

  private emailKey(email: string): string {
    return `${USER_PREFIX}:email:${email.toLowerCase()}`;
  }

  private backupKey(userId: string): string {
    return `${USER_PREFIX}:backup:${userId}`;
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

  async findByEmail(email: string): Promise<StoredUser | null> {
    const userId = await redis.get(this.emailKey(email));
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

    const legacy = await this.findLegacyUserForGoogle(profile);
    if (legacy) {
      const linked = this.withDefaults({
        ...legacy,
        provider: 'google',
        googleSub: profile.sub,
        email: profile.email ?? legacy.email,
        displayName: profile.name ?? legacy.displayName,
        picture: profile.picture ?? legacy.picture,
        passwordHash: legacy.passwordHash,
        migratedFromUserId: legacy.userId,
        updatedAt: Date.now(),
      });
      await this.saveUser(linked);
      return { user: linked, isNew: false };
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

  async updateProfile(
    userId: string,
    patch: { avatarConfig?: AvatarConfig; position?: StoredProfilePosition; unlockedItems?: string[] },
  ): Promise<StoredUser | null> {
    const user = await this.findById(userId);
    if (!user) return null;
    const next = this.withDefaults({
      ...user,
      avatarConfig: patch.avatarConfig
        ? { ...patch.avatarConfig, userId: user.userId, username: user.username }
        : user.avatarConfig,
      position: patch.position ?? user.position,
      unlockedItems: patch.unlockedItems
        ? [...new Set(patch.unlockedItems.filter((item) => typeof item === 'string' && item.length > 0))]
        : user.unlockedItems,
      updatedAt: Date.now(),
    });
    await this.saveUser(next);
    return next;
  }

  async updatePosition(userId: string, position: StoredProfilePosition): Promise<StoredUser | null> {
    return this.updateProfile(userId, { position });
  }

  async adjustPetals(userId: string, delta: number): Promise<StoredUser | null> {
    return delta >= 0
      ? this.awardPetals(userId, delta, 'admin')
      : this.spendPetals(userId, Math.abs(delta), 'admin');
  }

  async awardPetals(userId: string, amount: number, source: 'flower' | 'daily' | 'event' | 'task' | 'admin'): Promise<StoredUser | null> {
    const user = await this.findById(userId);
    if (!user) return null;
    const value = Math.max(0, Math.trunc(amount));
    if (value === 0) return user;
    const stats = { ...user.stats };
    stats.petalsEarned += value;
    if (source === 'flower') {
      stats.flowerPetalsCollected += 1;
      stats.lastPetalCollectAt = Date.now();
    } else if (source === 'daily') {
      stats.dailyPresenceClaims += 1;
      stats.lastDailyPresenceAt = Date.now();
    } else if (source === 'event') {
      stats.barEventsCompleted += 1;
    } else if (source === 'task') {
      stats.miniTasksCompleted += 1;
    }
    const next = this.withDefaults({
      ...user,
      petals: (user.petals ?? 0) + value,
      stats,
      updatedAt: Date.now(),
    });
    await this.saveUser(next);
    return next;
  }

  async spendPetals(userId: string, amount: number, source: 'counter' | 'waiter' | 'jukebox' | 'cosmetic' | 'admin' = 'admin'): Promise<StoredUser | null> {
    const cost = Math.max(0, Math.trunc(amount));
    const user = await this.findById(userId);
    if (!user || (user.petals ?? 0) < cost) return null;
    const stats = { ...user.stats };
    stats.petalsSpent += cost;
    if (source === 'counter' || source === 'waiter') stats.itemsPurchased += 1;
    if (source === 'waiter') stats.waiterOrders += 1;
    if (source === 'jukebox') stats.jukeboxPlays += 1;
    const next = this.withDefaults({
      ...user,
      petals: user.petals - cost,
      stats,
      updatedAt: Date.now(),
    });
    await this.saveUser(next);
    return next;
  }

  async claimDailyPresence(userId: string): Promise<{ user: StoredUser; awarded: boolean; nextAt: number } | null> {
    const user = await this.findById(userId);
    if (!user) return null;
    const last = user.stats.lastDailyPresenceAt;
    const nextAt = last + ONE_DAY_MS;
    if (last > 0 && Date.now() < nextAt) return { user, awarded: false, nextAt };
    const next = await this.awardPetals(userId, DAILY_PRESENCE_REWARD, 'daily');
    return next ? { user: next, awarded: true, nextAt: Date.now() + ONE_DAY_MS } : null;
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
    const idKey = this.idKey(user.userId);
    const usernameKey = this.usernameKey(user.username);
    await redis.set(idKey, value);
    await redis.set(usernameKey, value);
    await redis.set(this.backupKey(user.userId), value);
    await this.persistKey(idKey);
    await this.persistKey(usernameKey);
    await this.persistKey(this.backupKey(user.userId));
    if (user.googleSub) {
      const googleKey = this.googleKey(user.googleSub);
      await redis.set(googleKey, user.userId);
      await this.persistKey(googleKey);
    }
    if (user.email) {
      const emailKey = this.emailKey(user.email);
      await redis.set(emailKey, user.userId);
      await this.persistKey(emailKey);
    }
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
      position: this.normalizePosition(raw.position),
      unlockedItems: Array.isArray(raw.unlockedItems)
        ? raw.unlockedItems.filter((item): item is string => typeof item === 'string')
        : [],
      stats: this.withDefaultStats(raw.stats),
      petals: typeof raw.petals === 'number' ? Math.max(0, Math.trunc(raw.petals)) : STARTING_PETALS,
      createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
      updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : now,
      migratedFromUserId: raw.migratedFromUserId,
    };
  }

  private withDefaultStats(raw: Partial<StoredUserStats> | undefined): StoredUserStats {
    return {
      petalsEarned: Math.max(0, Math.trunc(raw?.petalsEarned ?? 0)),
      petalsSpent: Math.max(0, Math.trunc(raw?.petalsSpent ?? 0)),
      flowerPetalsCollected: Math.max(0, Math.trunc(raw?.flowerPetalsCollected ?? 0)),
      dailyPresenceClaims: Math.max(0, Math.trunc(raw?.dailyPresenceClaims ?? 0)),
      barEventsCompleted: Math.max(0, Math.trunc(raw?.barEventsCompleted ?? 0)),
      miniTasksCompleted: Math.max(0, Math.trunc(raw?.miniTasksCompleted ?? 0)),
      itemsPurchased: Math.max(0, Math.trunc(raw?.itemsPurchased ?? 0)),
      waiterOrders: Math.max(0, Math.trunc(raw?.waiterOrders ?? 0)),
      jukeboxPlays: Math.max(0, Math.trunc(raw?.jukeboxPlays ?? 0)),
      lastPetalCollectAt: typeof raw?.lastPetalCollectAt === 'number' ? raw.lastPetalCollectAt : 0,
      lastDailyPresenceAt: typeof raw?.lastDailyPresenceAt === 'number' ? raw.lastDailyPresenceAt : 0,
      lastSeenAt: typeof raw?.lastSeenAt === 'number' ? raw.lastSeenAt : Date.now(),
    };
  }

  private normalizePosition(raw: unknown): StoredProfilePosition | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const value = raw as Partial<StoredProfilePosition>;
    if (
      typeof value.roomId !== 'string' ||
      typeof value.x !== 'number' ||
      typeof value.y !== 'number' ||
      !Number.isFinite(value.x) ||
      !Number.isFinite(value.y)
    ) return undefined;
    return {
      roomId: value.roomId,
      x: value.x,
      y: value.y,
      locationId: typeof value.locationId === 'string' ? value.locationId : undefined,
      updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now(),
    };
  }

  private async findLegacyUserForGoogle(profile: GoogleProfile): Promise<StoredUser | null> {
    if (profile.email) {
      const byEmail = await this.findByEmail(profile.email);
      if (byEmail && byEmail.provider === 'password' && !byEmail.googleSub) return byEmail;

      const byUsername = await this.findByUsername(profile.email.split('@')[0]);
      if (byUsername && byUsername.provider === 'password' && !byUsername.googleSub) return byUsername;
    }
    return null;
  }

  private async persistKey(key: string): Promise<void> {
    try {
      await redis.persist(key);
    } catch {
      // Some mocks/managed Redis modes may not support PERSIST; a plain SET
      // without EX already keeps account keys permanent.
    }
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
