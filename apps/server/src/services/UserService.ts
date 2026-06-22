import { randomUUID } from 'node:crypto';
import {
  CHAT_ACTIVITY_XP,
  DAILY_PRESENCE_REWARD,
  DAILY_PRESENCE_XP,
  DAILY_QUESTS,
  PETAL_ACTIVITY_XP,
  currentLevelXp,
  dayKey,
  levelForXp,
  nextLevelXp,
  normalizeDailyQuestState,
  previousDayKey,
  questProgress,
  startOfNextUtcDay,
  streakPetalReward,
  cosmeticById,
} from '@social-square/shared';
import bcrypt from 'bcryptjs';
import { query, withTransaction } from '../config/database';
import { redis } from '../config/redis';
import { logInfo, logWarn } from '../utils/logger';
import type { AvatarConfig, Position, ProgressActivity, UserProgressSnapshot } from '@social-square/shared';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';

const SALT_ROUNDS = 10;
const STARTING_PETALS = 0;
const LEGACY_USER_PREFIX = 'user';

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
  poolPlays: number;
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

export interface ConsentRecord {
  ageConfirmedAt: number;
  tosAcceptedAt: number;
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
  tokenVersion: number;
  createdAt: number;
  updatedAt: number;
  migratedFromUserId?: string;
  ageConfirmedAt?: number;
  tosAcceptedAt?: number;
}

export type PetalAwardSource = 'flower' | 'daily' | 'event' | 'task' | 'admin';
export type PetalSpendSource = 'counter' | 'waiter' | 'jukebox' | 'pool' | 'cosmetic' | 'admin';
export type PetalLedgerReason = PetalAwardSource | PetalSpendSource | 'legacy-import';

export interface WalletMutation {
  userId: string;
  delta: number;
  reason: PetalLedgerReason;
  refId: string;
}

export interface WalletInvariant {
  userPetals: number;
  ledgerSum: number;
}

export interface UserRepository {
  findById(userId: string): Promise<StoredUser | null>;
  findByUsername(username: string): Promise<StoredUser | null>;
  findByGoogleSub(sub: string): Promise<StoredUser | null>;
  findByEmail(email: string): Promise<StoredUser | null>;
  createUser(user: StoredUser): Promise<StoredUser>;
  updateUser(user: StoredUser): Promise<StoredUser>;
  applyWalletDelta(mutation: WalletMutation): Promise<StoredUser | null>;
  purchaseCosmetic(userId: string, itemId: string, price: number, refId: string): Promise<StoredUser | null>;
  walletInvariant(userId: string): Promise<WalletInvariant | null>;
  repairWalletFloor(userId: string): Promise<StoredUser | null>;
  findWalletReplay(userId: string, refIds: string[]): Promise<StoredUser | null>;
  revokeSessions(userId: string): Promise<StoredUser | null>;
}

interface UserRow extends QueryResultRow {
  id: string;
  username: string;
  password_hash: string | null;
  provider: 'password' | 'google';
  google_sub: string | null;
  email: string | null;
  display_name: string | null;
  picture: string | null;
  avatar_config: unknown;
  position: unknown;
  unlocked_items: unknown;
  stats: unknown;
  petals: string | number;
  token_version: number;
  migrated_from_user_id: string | null;
  age_confirmed_at: Date | string | number | null;
  tos_accepted_at: Date | string | number | null;
  created_at: Date | string | number;
  updated_at: Date | string | number;
}

interface ProgressRow extends QueryResultRow {
  user_id: string;
  xp: string | number;
  level: number;
  streak_days: number;
  last_presence_claim_at: Date | string | number | null;
  quests: unknown;
  updated_at: Date | string | number;
}

function timeFrom(value: unknown, fallback = Date.now()): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function jsonValue<T>(raw: unknown, fallback: T): T {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
  return raw as T;
}

function normalizePosition(raw: unknown): StoredProfilePosition | undefined {
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

function defaultStats(raw: Partial<StoredUserStats> | undefined): StoredUserStats {
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
    poolPlays: Math.max(0, Math.trunc(raw?.poolPlays ?? 0)),
    lastPetalCollectAt: typeof raw?.lastPetalCollectAt === 'number' ? raw.lastPetalCollectAt : 0,
    lastDailyPresenceAt: typeof raw?.lastDailyPresenceAt === 'number' ? raw.lastDailyPresenceAt : 0,
    lastSeenAt: typeof raw?.lastSeenAt === 'number' ? raw.lastSeenAt : Date.now(),
  };
}

function mergeStatsFloor(current: StoredUserStats, imported: StoredUserStats): StoredUserStats {
  return {
    petalsEarned: Math.max(current.petalsEarned, imported.petalsEarned),
    petalsSpent: Math.max(current.petalsSpent, imported.petalsSpent),
    flowerPetalsCollected: Math.max(current.flowerPetalsCollected, imported.flowerPetalsCollected),
    dailyPresenceClaims: Math.max(current.dailyPresenceClaims, imported.dailyPresenceClaims),
    barEventsCompleted: Math.max(current.barEventsCompleted, imported.barEventsCompleted),
    miniTasksCompleted: Math.max(current.miniTasksCompleted, imported.miniTasksCompleted),
    itemsPurchased: Math.max(current.itemsPurchased, imported.itemsPurchased),
    waiterOrders: Math.max(current.waiterOrders, imported.waiterOrders),
    jukeboxPlays: Math.max(current.jukeboxPlays, imported.jukeboxPlays),
    poolPlays: Math.max(current.poolPlays, imported.poolPlays),
    lastPetalCollectAt: Math.max(current.lastPetalCollectAt, imported.lastPetalCollectAt),
    lastDailyPresenceAt: Math.max(current.lastDailyPresenceAt, imported.lastDailyPresenceAt),
    lastSeenAt: Math.max(current.lastSeenAt, imported.lastSeenAt),
  };
}

function normalizeUser(raw: Partial<StoredUser>): StoredUser {
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
    position: normalizePosition(raw.position),
    unlockedItems: Array.isArray(raw.unlockedItems)
      ? raw.unlockedItems.filter((item): item is string => typeof item === 'string')
      : [],
    stats: defaultStats(raw.stats),
    petals: typeof raw.petals === 'number' ? Math.max(0, Math.trunc(raw.petals)) : STARTING_PETALS,
    tokenVersion: Math.max(0, Math.trunc(raw.tokenVersion ?? 0)),
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : now,
    migratedFromUserId: raw.migratedFromUserId,
    ageConfirmedAt: typeof raw.ageConfirmedAt === 'number' ? raw.ageConfirmedAt : undefined,
    tosAcceptedAt: typeof raw.tosAcceptedAt === 'number' ? raw.tosAcceptedAt : undefined,
  };
}

function rowToUser(row: UserRow): StoredUser {
  return normalizeUser({
    userId: row.id,
    username: row.username,
    passwordHash: row.password_hash ?? undefined,
    provider: row.provider,
    googleSub: row.google_sub ?? undefined,
    email: row.email ?? undefined,
    displayName: row.display_name ?? undefined,
    picture: row.picture ?? undefined,
    avatarConfig: jsonValue<AvatarConfig | undefined>(row.avatar_config, undefined),
    position: normalizePosition(jsonValue<unknown>(row.position, undefined)),
    unlockedItems: jsonValue<string[]>(row.unlocked_items, []),
    stats: defaultStats(jsonValue<Partial<StoredUserStats>>(row.stats, {})),
    petals: Number(row.petals),
    tokenVersion: row.token_version,
    createdAt: timeFrom(row.created_at),
    updatedAt: timeFrom(row.updated_at),
    migratedFromUserId: row.migrated_from_user_id ?? undefined,
    ageConfirmedAt: row.age_confirmed_at ? timeFrom(row.age_confirmed_at) : undefined,
    tosAcceptedAt: row.tos_accepted_at ? timeFrom(row.tos_accepted_at) : undefined,
  });
}

function rowToProgress(row: ProgressRow, date = dayKey()): UserProgressSnapshot {
  const xp = Math.max(0, Math.trunc(Number(row.xp)));
  const level = Math.max(levelForXp(xp), Math.max(1, Math.trunc(row.level)));
  return {
    xp,
    level,
    currentLevelXp: currentLevelXp(level),
    nextLevelXp: nextLevelXp(level),
    streakDays: Math.max(0, Math.trunc(row.streak_days)),
    lastPresenceClaimAt: row.last_presence_claim_at ? timeFrom(row.last_presence_claim_at) : null,
    daily: normalizeDailyQuestState(jsonValue<unknown>(row.quests, {}), date),
  };
}

function progressFromValues(
  xp: number,
  streakDays: number,
  lastPresenceClaimAt: number | null,
  daily: UserProgressSnapshot['daily'],
): UserProgressSnapshot {
  const level = levelForXp(xp);
  return {
    xp,
    level,
    currentLevelXp: currentLevelXp(level),
    nextLevelXp: nextLevelXp(level),
    streakDays,
    lastPresenceClaimAt,
    daily,
  };
}

export function statsAfterWalletDelta(
  stats: StoredUserStats,
  amount: number,
  reason: PetalLedgerReason,
  now = Date.now(),
): StoredUserStats {
  const next = { ...stats, lastSeenAt: now };
  if (reason === 'flower' || reason === 'daily' || reason === 'event' || reason === 'task' || reason === 'admin') {
    next.petalsEarned += amount;
  }
  if (reason === 'flower') {
    next.flowerPetalsCollected += 1;
    next.lastPetalCollectAt = now;
  } else if (reason === 'daily') {
    next.dailyPresenceClaims += 1;
    next.lastDailyPresenceAt = now;
  } else if (reason === 'event') {
    next.barEventsCompleted += 1;
  } else if (reason === 'task') {
    next.miniTasksCompleted += 1;
  } else if (reason === 'counter' || reason === 'waiter' || reason === 'jukebox' || reason === 'pool' || reason === 'cosmetic') {
    next.petalsSpent += amount;
    if (reason === 'counter' || reason === 'waiter') next.itemsPurchased += 1;
    if (reason === 'waiter') next.waiterOrders += 1;
    if (reason === 'jukebox') next.jukeboxPlays += 1;
    if (reason === 'pool') next.poolPlays += 1;
  }
  return next;
}

async function oneUser(result: Promise<QueryResult<UserRow>>): Promise<StoredUser | null> {
  const rows = (await result).rows;
  return rows[0] ? rowToUser(rows[0]) : null;
}

export class PostgresUserRepository implements UserRepository {
  findById(userId: string): Promise<StoredUser | null> {
    return oneUser(query<UserRow>('SELECT * FROM users WHERE id = $1', [userId]));
  }

  findByUsername(username: string): Promise<StoredUser | null> {
    return oneUser(query<UserRow>('SELECT * FROM users WHERE username = $1', [username]));
  }

  findByGoogleSub(sub: string): Promise<StoredUser | null> {
    return oneUser(query<UserRow>('SELECT * FROM users WHERE google_sub = $1', [sub]));
  }

  findByEmail(email: string): Promise<StoredUser | null> {
    return oneUser(query<UserRow>('SELECT * FROM users WHERE email = $1', [email]));
  }

  async createUser(rawUser: StoredUser): Promise<StoredUser> {
    const user = normalizeUser(rawUser);
    const inserted = await oneUser(query<UserRow>(
      `
        INSERT INTO users (
          id, username, provider, password_hash, google_sub, email, display_name,
          picture, avatar_config, position, unlocked_items, petals, stats,
          migrated_from_user_id, token_version, age_confirmed_at, tos_accepted_at,
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12, $13::jsonb, $14, $15, $16, $17, $18, $19)
        RETURNING *
      `,
      [
        user.userId,
        user.username,
        user.provider,
        user.passwordHash ?? null,
        user.googleSub ?? null,
        user.email ?? null,
        user.displayName ?? null,
        user.picture ?? null,
        user.avatarConfig ? JSON.stringify(user.avatarConfig) : null,
        user.position ? JSON.stringify(user.position) : null,
        JSON.stringify(user.unlockedItems),
        user.petals,
        JSON.stringify(user.stats),
        user.migratedFromUserId ?? null,
        user.tokenVersion,
        user.ageConfirmedAt ? new Date(user.ageConfirmedAt) : null,
        user.tosAcceptedAt ? new Date(user.tosAcceptedAt) : null,
        new Date(user.createdAt),
        new Date(user.updatedAt),
      ],
    ));
    if (!inserted) throw new Error('USER_CREATE_FAILED');
    if (inserted.petals > 0) {
      await this.applyInitialLedger(inserted.userId, inserted.petals);
    }
    return inserted;
  }

  async updateUser(rawUser: StoredUser): Promise<StoredUser> {
    const user = normalizeUser(rawUser);
    const updated = await oneUser(query<UserRow>(
      `
        UPDATE users SET
          username = $2,
          provider = $3,
          password_hash = $4,
          google_sub = $5,
          email = $6,
          display_name = $7,
          picture = $8,
          avatar_config = $9::jsonb,
          position = $10::jsonb,
          unlocked_items = $11::jsonb,
          stats = $12::jsonb,
          migrated_from_user_id = $13,
          age_confirmed_at = $14,
          tos_accepted_at = $15,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [
        user.userId,
        user.username,
        user.provider,
        user.passwordHash ?? null,
        user.googleSub ?? null,
        user.email ?? null,
        user.displayName ?? null,
        user.picture ?? null,
        user.avatarConfig ? JSON.stringify(user.avatarConfig) : null,
        user.position ? JSON.stringify(user.position) : null,
        JSON.stringify(user.unlockedItems),
        JSON.stringify(user.stats),
        user.migratedFromUserId ?? null,
        user.ageConfirmedAt ? new Date(user.ageConfirmedAt) : null,
        user.tosAcceptedAt ? new Date(user.tosAcceptedAt) : null,
      ],
    ));
    if (!updated) throw new Error('USER_NOT_FOUND');
    return updated;
  }

  async applyWalletDelta(mutation: WalletMutation): Promise<StoredUser | null> {
    const delta = Math.trunc(mutation.delta);
    if (delta === 0) return this.findById(mutation.userId);

    return withTransaction(async (client) => {
      const replayed = await this.findLedgerReplay(client, mutation.userId, mutation.refId);
      if (replayed) return replayed;

      const locked = await client.query<UserRow>('SELECT * FROM users WHERE id = $1 FOR UPDATE', [mutation.userId]);
      if (!locked.rows[0]) return null;
      const current = await this.repairLockedWalletFloor(client, rowToUser(locked.rows[0]));
      const nextStats = statsAfterWalletDelta(current.stats, Math.abs(delta), mutation.reason);
      const updated = await client.query<UserRow>(
        `
          UPDATE users
          SET petals = petals + $2,
              stats = $3::jsonb,
              updated_at = NOW()
          WHERE id = $1
            AND petals + $2 >= 0
          RETURNING *
        `,
        [mutation.userId, delta, JSON.stringify(nextStats)],
      );
      if (!updated.rows[0]) return null;

      const user = rowToUser(updated.rows[0]);
      await client.query(
        `
          INSERT INTO petal_ledger (user_id, delta, reason, ref_id, balance_after)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [mutation.userId, delta, mutation.reason, mutation.refId, user.petals],
      );
      return user;
    });
  }

  async walletInvariant(userId: string): Promise<WalletInvariant | null> {
    const result = await query<{ petals: string | number; ledger_sum: string | number }>(
      `
        SELECT users.petals, COALESCE(SUM(petal_ledger.delta), 0) AS ledger_sum
        FROM users
        LEFT JOIN petal_ledger ON petal_ledger.user_id = users.id
        WHERE users.id = $1
        GROUP BY users.id
      `,
      [userId],
    );
    if (!result.rows[0]) return null;
    return {
      userPetals: Number(result.rows[0].petals),
      ledgerSum: Number(result.rows[0].ledger_sum),
    };
  }

  async repairWalletFloor(userId: string): Promise<StoredUser | null> {
    return withTransaction(async (client) => {
      const locked = await client.query<UserRow>('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId]);
      if (!locked.rows[0]) return null;
      return this.repairLockedWalletFloor(client, rowToUser(locked.rows[0]));
    });
  }

  async findWalletReplay(userId: string, refIds: string[]): Promise<StoredUser | null> {
    const safeRefs = [...new Set(refIds.filter((refId) => refId.length > 0))];
    if (safeRefs.length === 0) return null;
    const result = await oneUser(query<UserRow>(
      `
        SELECT users.*
        FROM petal_ledger
        JOIN users ON users.id = petal_ledger.user_id
        WHERE petal_ledger.user_id = $1
          AND petal_ledger.ref_id = ANY($2::text[])
        ORDER BY petal_ledger.created_at DESC
        LIMIT 1
      `,
      [userId, safeRefs],
    ));
    return result ? this.repairWalletFloor(result.userId) : null;
  }

  async purchaseCosmetic(userId: string, itemId: string, price: number, refId: string): Promise<StoredUser | null> {
    return withTransaction(async (client) => {
      const replayed = await this.findLedgerReplay(client, userId, refId);
      if (replayed) return replayed;
      const locked = await client.query<UserRow>('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId]);
      if (!locked.rows[0]) return null;
      const current = await this.repairLockedWalletFloor(client, rowToUser(locked.rows[0]));
      if (current.unlockedItems.includes(itemId)) return current;

      const cost = Math.max(0, Math.trunc(price));
      const nextStats = statsAfterWalletDelta(current.stats, cost, 'cosmetic');
      const nextUnlocked = [...new Set([...current.unlockedItems, itemId])];
      const updated = await client.query<UserRow>(
        `
          UPDATE users
          SET petals = petals - $2,
              unlocked_items = $3::jsonb,
              stats = $4::jsonb,
              updated_at = NOW()
          WHERE id = $1
            AND petals - $2 >= 0
          RETURNING *
        `,
        [userId, cost, JSON.stringify(nextUnlocked), JSON.stringify(nextStats)],
      );
      if (!updated.rows[0]) return null;
      const user = rowToUser(updated.rows[0]);
      await client.query(
        `
          INSERT INTO petal_ledger (user_id, delta, reason, ref_id, balance_after)
          VALUES ($1, $2, 'cosmetic', $3, $4)
        `,
        [userId, -cost, refId, user.petals],
      );
      return user;
    });
  }

  async revokeSessions(userId: string): Promise<StoredUser | null> {
    return withTransaction(async (client) => {
      await client.query(
        'UPDATE auth_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
        [userId],
      );
      const updated = await client.query<UserRow>(
        'UPDATE users SET token_version = token_version + 1, updated_at = NOW() WHERE id = $1 RETURNING *',
        [userId],
      );
      return updated.rows[0] ? rowToUser(updated.rows[0]) : null;
    });
  }

  private async findLedgerReplay(client: PoolClient, userId: string, refId: string): Promise<StoredUser | null> {
    const existing = await client.query<UserRow>(
      `
        SELECT users.*
        FROM petal_ledger
        JOIN users ON users.id = petal_ledger.user_id
        WHERE petal_ledger.user_id = $1
          AND petal_ledger.ref_id = $2
        FOR UPDATE OF users
      `,
      [userId, refId],
    );
    return existing.rows[0] ? this.repairLockedWalletFloor(client, rowToUser(existing.rows[0])) : null;
  }

  private async repairLockedWalletFloor(client: PoolClient, user: StoredUser): Promise<StoredUser> {
    const result = await client.query<{ ledger_sum: string | number }>(
      'SELECT COALESCE(SUM(delta), 0) AS ledger_sum FROM petal_ledger WHERE user_id = $1',
      [user.userId],
    );
    const ledgerSum = Math.max(0, Math.trunc(Number(result.rows[0]?.ledger_sum ?? 0)));
    if (ledgerSum <= user.petals) return user;

    const updated = await client.query<UserRow>(
      'UPDATE users SET petals = $2, updated_at = NOW() WHERE id = $1 AND petals < $2 RETURNING *',
      [user.userId, ledgerSum],
    );
    const repaired = updated.rows[0] ? rowToUser(updated.rows[0]) : user;
    logWarn('wallet.repaired_from_ledger', {
      userId: user.userId,
      previousPetals: user.petals,
      ledgerSum,
    });
    return repaired;
  }

  private async applyInitialLedger(userId: string, petals: number): Promise<void> {
    await query(
      `
        INSERT INTO petal_ledger (user_id, delta, reason, ref_id, balance_after)
        VALUES ($1, $2, 'admin', $3, $2)
        ON CONFLICT (user_id, ref_id) WHERE ref_id IS NOT NULL DO NOTHING
      `,
      [userId, petals, `initial:${userId}`],
    );
  }
}

export class UserService {
  constructor(private readonly repository: UserRepository = new PostgresUserRepository()) {}

  async findByUsername(username: string): Promise<StoredUser | null> {
    const user = await this.withWalletFloor(await this.repository.findByUsername(username));
    return this.reconcileLegacyUser(user, await this.findLegacyByUsername(username), 'username');
  }

  async findById(userId: string): Promise<StoredUser | null> {
    const user = await this.withWalletFloor(await this.repository.findById(userId));
    return this.reconcileLegacyUser(user, await this.findLegacyById(userId), 'id');
  }

  async findByGoogleSub(sub: string): Promise<StoredUser | null> {
    const user = await this.withWalletFloor(await this.repository.findByGoogleSub(sub));
    return this.reconcileLegacyUser(user, await this.findLegacyByGoogleSub(sub), 'google');
  }

  async findByEmail(email: string): Promise<StoredUser | null> {
    const user = await this.withWalletFloor(await this.repository.findByEmail(email));
    return this.reconcileLegacyUser(user, await this.findLegacyByEmail(email), 'email');
  }

  async createPasswordUser(username: string, password: string, consent?: ConsentRecord): Promise<StoredUser> {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const now = Date.now();
    return this.repository.createUser(normalizeUser({
      userId: `user_${now}_${randomUUID().slice(0, 8)}`,
      username,
      passwordHash,
      provider: 'password',
      petals: STARTING_PETALS,
      ageConfirmedAt: consent?.ageConfirmedAt,
      tosAcceptedAt: consent?.tosAcceptedAt,
      createdAt: now,
      updatedAt: now,
    }));
  }

  async loginOrCreateGoogleUser(profile: GoogleProfile, consent?: ConsentRecord): Promise<{ user: StoredUser; isNew: boolean }> {
    const existing = await this.findByGoogleSub(profile.sub);
    if (existing) {
      const next = normalizeUser({
        ...existing,
        email: profile.email ?? existing.email,
        displayName: profile.name ?? existing.displayName,
        picture: profile.picture ?? existing.picture,
        ageConfirmedAt: existing.ageConfirmedAt ?? consent?.ageConfirmedAt,
        tosAcceptedAt: existing.tosAcceptedAt ?? consent?.tosAcceptedAt,
        updatedAt: Date.now(),
      });
      return { user: await this.repository.updateUser(next), isNew: false };
    }

    const legacy = await this.findLegacyUserForGoogle(profile);
    if (legacy) {
      const linked = normalizeUser({
        ...legacy,
        provider: 'google',
        googleSub: profile.sub,
        email: profile.email ?? legacy.email,
        displayName: profile.name ?? legacy.displayName,
        picture: profile.picture ?? legacy.picture,
        passwordHash: legacy.passwordHash,
        migratedFromUserId: legacy.migratedFromUserId ?? legacy.userId,
        ageConfirmedAt: legacy.ageConfirmedAt ?? consent?.ageConfirmedAt,
        tosAcceptedAt: legacy.tosAcceptedAt ?? consent?.tosAcceptedAt,
        updatedAt: Date.now(),
      });
      return { user: await this.repository.updateUser(linked), isNew: false };
    }

    const now = Date.now();
    const username = await this.uniqueUsername(profile.name ?? profile.email?.split('@')[0] ?? 'Giocatore');
    const user = await this.repository.createUser(normalizeUser({
      userId: `google_${profile.sub}`,
      username,
      provider: 'google',
      googleSub: profile.sub,
      email: profile.email,
      displayName: profile.name,
      picture: profile.picture,
      petals: STARTING_PETALS,
      ageConfirmedAt: consent?.ageConfirmedAt,
      tosAcceptedAt: consent?.tosAcceptedAt,
      createdAt: now,
      updatedAt: now,
    }));
    return { user, isNew: true };
  }

  async verifyPassword(user: StoredUser, password: string): Promise<boolean> {
    return typeof user.passwordHash === 'string' && bcrypt.compare(password, user.passwordHash);
  }

  /** Register if new user, login if existing. O6 splits this into explicit endpoints. */
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
    return ok ? { user: existing, isNew: false } : null;
  }

  async updateAvatarConfig(userId: string, avatarConfig: AvatarConfig): Promise<StoredUser | null> {
    const user = await this.findById(userId);
    if (!user) return null;
    return this.repository.updateUser(normalizeUser({
      ...user,
      avatarConfig: {
        ...avatarConfig,
        userId: user.userId,
        username: user.username,
      },
      updatedAt: Date.now(),
    }));
  }

  async updateProfile(
    userId: string,
    patch: { avatarConfig?: AvatarConfig; position?: StoredProfilePosition; unlockedItems?: string[] },
  ): Promise<StoredUser | null> {
    const user = await this.findById(userId);
    if (!user) return null;
    return this.repository.updateUser(normalizeUser({
      ...user,
      avatarConfig: patch.avatarConfig
        ? { ...patch.avatarConfig, userId: user.userId, username: user.username }
        : user.avatarConfig,
      position: patch.position ?? user.position,
      unlockedItems: patch.unlockedItems
        ? [...new Set(patch.unlockedItems.filter((item) => typeof item === 'string' && item.length > 0))]
        : user.unlockedItems,
      updatedAt: Date.now(),
    }));
  }

  async updatePosition(userId: string, position: StoredProfilePosition): Promise<StoredUser | null> {
    return this.updateProfile(userId, { position });
  }

  async adjustPetals(userId: string, delta: number, refId = `admin:${randomUUID()}`): Promise<StoredUser | null> {
    return delta >= 0
      ? this.awardPetals(userId, delta, 'admin', refId)
      : this.spendPetals(userId, Math.abs(delta), 'admin', refId);
  }

  async awardPetals(
    userId: string,
    amount: number,
    source: PetalAwardSource,
    refId = `${source}:${randomUUID()}`,
  ): Promise<StoredUser | null> {
    const value = Math.max(0, Math.trunc(amount));
    if (value === 0) return this.findById(userId);
    return this.repository.applyWalletDelta({ userId, delta: value, reason: source, refId });
  }

  async spendPetals(
    userId: string,
    amount: number,
    source: PetalSpendSource = 'admin',
    refId = `${source}:${randomUUID()}`,
  ): Promise<StoredUser | null> {
    const cost = Math.max(0, Math.trunc(amount));
    if (cost === 0) return this.findById(userId);
    return this.repository.applyWalletDelta({ userId, delta: -cost, reason: source, refId });
  }

  async getProgress(userId: string): Promise<UserProgressSnapshot | null> {
    if (!(await this.findById(userId))) return null;
    await query('INSERT INTO user_progress (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
    const result = await query<ProgressRow>('SELECT * FROM user_progress WHERE user_id = $1', [userId]);
    return result.rows[0] ? rowToProgress(result.rows[0]) : null;
  }

  async claimDailyPresence(userId: string): Promise<{
    user: StoredUser;
    progress: UserProgressSnapshot;
    awarded: boolean;
    nextAt: number;
    petalReward: number;
    xpGained: number;
    levelUp: boolean;
  } | null> {
    const now = Date.now();
    const today = dayKey(now);
    return withTransaction(async (client) => {
      const locked = await client.query<UserRow>('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId]);
      if (!locked.rows[0]) return null;
      await this.ensureProgressRow(client, userId);
      const progressRow = await client.query<ProgressRow>('SELECT * FROM user_progress WHERE user_id = $1 FOR UPDATE', [userId]);
      if (!progressRow.rows[0]) return null;

      const currentUser = await this.repairLockedUserWalletFloor(client, rowToUser(locked.rows[0]));
      const currentProgress = rowToProgress(progressRow.rows[0], today);
      const lastClaimAt = currentProgress.lastPresenceClaimAt;
      if (lastClaimAt && dayKey(lastClaimAt) === today) {
        return {
          user: currentUser,
          progress: {
            ...currentProgress,
            daily: { ...currentProgress.daily, presenceClaimed: true },
          },
          awarded: false,
          nextAt: startOfNextUtcDay(now),
          petalReward: 0,
          xpGained: 0,
          levelUp: false,
        };
      }

      const streakDays = lastClaimAt && dayKey(lastClaimAt) === previousDayKey(now)
        ? currentProgress.streakDays + 1
        : 1;
      const petalReward = streakPetalReward(DAILY_PRESENCE_REWARD, streakDays);
      const xpGained = DAILY_PRESENCE_XP + Math.min(50, streakDays * 5);
      const nextXp = currentProgress.xp + xpGained;
      const levelUp = levelForXp(nextXp) > currentProgress.level;
      const daily = { ...currentProgress.daily, presenceClaimed: true };
      const nextStats = statsAfterWalletDelta(currentUser.stats, petalReward, 'daily', now);

      const updated = await client.query<UserRow>(
        `
          UPDATE users
          SET petals = petals + $2,
              stats = $3::jsonb,
              updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `,
        [userId, petalReward, JSON.stringify(nextStats)],
      );
      await client.query(
        `
          INSERT INTO petal_ledger (user_id, delta, reason, ref_id, balance_after)
          VALUES ($1, $2, 'daily', $3, $4)
          ON CONFLICT (user_id, ref_id) WHERE ref_id IS NOT NULL DO NOTHING
        `,
        [userId, petalReward, `daily:${userId}:${today}`, Number(updated.rows[0].petals)],
      );
      await client.query(
        `
          UPDATE user_progress
          SET xp = $2,
              level = $3,
              streak_days = $4,
              last_presence_claim_at = $5,
              quests = $6::jsonb,
              updated_at = NOW()
          WHERE user_id = $1
        `,
        [userId, nextXp, levelForXp(nextXp), streakDays, new Date(now), JSON.stringify(daily)],
      );

      return {
        user: rowToUser(updated.rows[0]),
        progress: progressFromValues(nextXp, streakDays, now, daily),
        awarded: true,
        nextAt: startOfNextUtcDay(now),
        petalReward,
        xpGained,
        levelUp,
      };
    });
  }

  async recordProgressActivity(userId: string, activity: ProgressActivity, amount = 1): Promise<{
    user: StoredUser;
    progress: UserProgressSnapshot;
    petalReward: number;
    xpGained: number;
    levelUp: boolean;
  } | null> {
    const now = Date.now();
    const today = dayKey(now);
    const count = Math.max(1, Math.trunc(amount));
    return withTransaction(async (client) => {
      const locked = await client.query<UserRow>('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId]);
      if (!locked.rows[0]) return null;
      await this.ensureProgressRow(client, userId);
      const progressRow = await client.query<ProgressRow>('SELECT * FROM user_progress WHERE user_id = $1 FOR UPDATE', [userId]);
      if (!progressRow.rows[0]) return null;

      const currentUser = await this.repairLockedUserWalletFloor(client, rowToUser(locked.rows[0]));
      const currentProgress = rowToProgress(progressRow.rows[0], today);
      const daily = { ...currentProgress.daily };
      if (activity === 'chat') daily.chatMessages += count;
      else daily.petalsCollected += count;

      const rewardedQuestIds = new Set(daily.rewardedQuestIds);
      const newlyRewardedQuests: Array<{ id: string; petalReward: number }> = [];
      let petalReward = 0;
      let questXp = 0;
      for (const quest of DAILY_QUESTS) {
        if (quest.activity !== activity || rewardedQuestIds.has(quest.id)) continue;
        if (questProgress(daily, quest) < quest.target) continue;
        rewardedQuestIds.add(quest.id);
        newlyRewardedQuests.push({ id: quest.id, petalReward: quest.petalReward });
        petalReward += quest.petalReward;
        questXp += quest.xpReward;
      }
      daily.rewardedQuestIds = [...rewardedQuestIds];

      const activityXp = (activity === 'chat' ? CHAT_ACTIVITY_XP : PETAL_ACTIVITY_XP) * count;
      const xpGained = activityXp + questXp;
      const nextXp = currentProgress.xp + xpGained;
      const levelUp = levelForXp(nextXp) > currentProgress.level;

      let nextUser = currentUser;
      if (petalReward > 0) {
        const nextStats = statsAfterWalletDelta(currentUser.stats, petalReward, 'task', now);
        const updated = await client.query<UserRow>(
          `
            UPDATE users
            SET petals = petals + $2,
                stats = $3::jsonb,
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
          `,
          [userId, petalReward, JSON.stringify(nextStats)],
        );
        nextUser = rowToUser(updated.rows[0]);
        let balanceAfter = nextUser.petals - petalReward;
        for (const quest of newlyRewardedQuests) {
          balanceAfter += quest.petalReward;
          await client.query(
            `
              INSERT INTO petal_ledger (user_id, delta, reason, ref_id, balance_after)
              VALUES ($1, $2, 'task', $3, $4)
              ON CONFLICT (user_id, ref_id) WHERE ref_id IS NOT NULL DO NOTHING
            `,
            [userId, quest.petalReward, `quest:${userId}:${today}:${quest.id}`, balanceAfter],
          );
        }
      }

      await client.query(
        `
          UPDATE user_progress
          SET xp = $2,
              level = $3,
              quests = $4::jsonb,
              updated_at = NOW()
          WHERE user_id = $1
        `,
        [userId, nextXp, levelForXp(nextXp), JSON.stringify(daily)],
      );

      return {
        user: nextUser,
        progress: progressFromValues(nextXp, currentProgress.streakDays, currentProgress.lastPresenceClaimAt, daily),
        petalReward,
        xpGained,
        levelUp,
      };
    });
  }

  async walletInvariant(userId: string): Promise<WalletInvariant | null> {
    return this.repository.walletInvariant(userId);
  }

  async revokeSessions(userId: string): Promise<StoredUser | null> {
    return this.repository.revokeSessions(userId);
  }

  async purchaseCosmetic(userId: string, itemId: string, refId = `cosmetic:${itemId}:${randomUUID()}`): Promise<StoredUser | null> {
    const item = cosmeticById(itemId);
    if (!item) return null;
    return this.repository.purchaseCosmetic(userId, item.id, item.price, refId);
  }

  private async ensureProgressRow(client: PoolClient, userId: string): Promise<void> {
    await client.query(
      'INSERT INTO user_progress (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
      [userId],
    );
  }

  private async repairLockedUserWalletFloor(client: PoolClient, user: StoredUser): Promise<StoredUser> {
    const result = await client.query<{ ledger_sum: string | number }>(
      'SELECT COALESCE(SUM(delta), 0) AS ledger_sum FROM petal_ledger WHERE user_id = $1',
      [user.userId],
    );
    const ledgerSum = Math.max(0, Math.trunc(Number(result.rows[0]?.ledger_sum ?? 0)));
    if (ledgerSum <= user.petals) return user;

    const updated = await client.query<UserRow>(
      'UPDATE users SET petals = $2, updated_at = NOW() WHERE id = $1 AND petals < $2 RETURNING *',
      [user.userId, ledgerSum],
    );
    logWarn('wallet.repaired_from_ledger', {
      userId: user.userId,
      previousPetals: user.petals,
      ledgerSum,
    });
    return updated.rows[0] ? rowToUser(updated.rows[0]) : user;
  }

  private async withWalletFloor(user: StoredUser | null): Promise<StoredUser | null> {
    if (!user) return null;
    return (await this.repository.repairWalletFloor(user.userId)) ?? user;
  }

  private shouldImportLegacyRedis(): boolean {
    return this.repository instanceof PostgresUserRepository;
  }

  private legacyIdKey(userId: string): string {
    return `${LEGACY_USER_PREFIX}:id:${userId}`;
  }

  private legacyBackupKey(userId: string): string {
    return `${LEGACY_USER_PREFIX}:backup:${userId}`;
  }

  private legacyUsernameKey(username: string): string {
    return `${LEGACY_USER_PREFIX}:${username.toLowerCase()}`;
  }

  private legacyGoogleKey(sub: string): string {
    return `${LEGACY_USER_PREFIX}:google:${sub}`;
  }

  private legacyEmailKey(email: string): string {
    return `${LEGACY_USER_PREFIX}:email:${email.toLowerCase()}`;
  }

  private async legacyGet(key: string): Promise<string | null> {
    if (!this.shouldImportLegacyRedis()) return null;
    try {
      return await redis.get(key);
    } catch (err) {
      logWarn('auth.legacy_redis_lookup_failed', {
        key,
        message: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  private async legacyUserFromKey(key: string): Promise<Partial<StoredUser> | null> {
    const raw = await this.legacyGet(key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === 'object' ? parsed as Partial<StoredUser> : null;
    } catch {
      return null;
    }
  }

  private async findLegacyById(userId: string): Promise<Partial<StoredUser> | null> {
    return (await this.legacyUserFromKey(this.legacyIdKey(userId)))
      ?? this.legacyUserFromKey(this.legacyBackupKey(userId));
  }

  private async findLegacyByUsername(username: string): Promise<Partial<StoredUser> | null> {
    return this.legacyUserFromKey(this.legacyUsernameKey(username.trim()));
  }

  private async findLegacyByGoogleSub(sub: string): Promise<Partial<StoredUser> | null> {
    const userId = await this.legacyGet(this.legacyGoogleKey(sub));
    return userId ? this.findLegacyById(userId) : null;
  }

  private async findLegacyByEmail(email: string): Promise<Partial<StoredUser> | null> {
    const userId = await this.legacyGet(this.legacyEmailKey(email));
    return userId ? this.findLegacyById(userId) : null;
  }

  private async importLegacyUser(raw: Partial<StoredUser> | null, source: string): Promise<StoredUser | null> {
    if (!raw || !this.shouldImportLegacyRedis()) return null;
    const legacy = normalizeUser(raw);
    const existing = await this.findRepositoryConflict(legacy);
    try {
      const imported = existing
        ? await this.mergeLegacyUser(existing, legacy)
        : await this.createLegacyUser(legacy);
      logInfo('auth.legacy_redis_user_imported', {
        source,
        userId: imported.userId,
        legacyUserId: legacy.userId,
        petals: imported.petals,
      });
      return imported;
    } catch (err) {
      logWarn('auth.legacy_redis_user_import_failed', {
        source,
        userId: legacy.userId,
        message: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  private async reconcileLegacyUser(
    user: StoredUser | null,
    raw: Partial<StoredUser> | null,
    source: string,
  ): Promise<StoredUser | null> {
    if (!raw || !this.shouldImportLegacyRedis()) return user;
    if (!user) return this.importLegacyUser(raw, source);

    const legacy = normalizeUser(raw);
    const userMatchesLegacy = user.userId === legacy.userId ||
      (Boolean(user.googleSub) && user.googleSub === legacy.googleSub) ||
      (Boolean(user.email) && user.email?.toLowerCase() === legacy.email?.toLowerCase()) ||
      user.username.toLowerCase() === legacy.username.toLowerCase();
    if (!userMatchesLegacy) return user;

    const shouldMerge = legacy.petals > user.petals ||
      legacy.unlockedItems.some((item) => !user.unlockedItems.includes(item)) ||
      (!user.googleSub && Boolean(legacy.googleSub)) ||
      (!user.email && Boolean(legacy.email)) ||
      (!user.avatarConfig && Boolean(legacy.avatarConfig));
    if (!shouldMerge) return user;

    try {
      const merged = await this.mergeLegacyUser(user, legacy);
      logInfo('auth.legacy_redis_user_reconciled', {
        source,
        userId: merged.userId,
        legacyUserId: legacy.userId,
        petals: merged.petals,
      });
      return merged;
    } catch (err) {
      logWarn('auth.legacy_redis_user_reconcile_failed', {
        source,
        userId: user.userId,
        legacyUserId: legacy.userId,
        message: err instanceof Error ? err.message : String(err),
      });
      return user;
    }
  }

  private async findRepositoryConflict(user: StoredUser): Promise<StoredUser | null> {
    return (await this.repository.findById(user.userId))
      ?? (user.googleSub ? await this.repository.findByGoogleSub(user.googleSub) : null)
      ?? (user.email ? await this.repository.findByEmail(user.email) : null)
      ?? await this.repository.findByUsername(user.username);
  }

  private async createLegacyUser(legacy: StoredUser): Promise<StoredUser> {
    const username = await this.uniqueRepositoryUsername(legacy.username);
    const created = await this.repository.createUser(normalizeUser({
      ...legacy,
      username,
      petals: 0,
    }));
    return this.applyLegacyPetalFloor(created, legacy);
  }

  private async mergeLegacyUser(existing: StoredUser, legacy: StoredUser): Promise<StoredUser> {
    const merged = await this.repository.updateUser(normalizeUser({
      ...existing,
      googleSub: existing.googleSub ?? legacy.googleSub,
      email: existing.email ?? legacy.email,
      displayName: legacy.displayName ?? existing.displayName,
      picture: legacy.picture ?? existing.picture,
      avatarConfig: existing.avatarConfig ?? legacy.avatarConfig,
      position: existing.position ?? legacy.position,
      unlockedItems: [...new Set([...existing.unlockedItems, ...legacy.unlockedItems])],
      stats: mergeStatsFloor(existing.stats, legacy.stats),
      migratedFromUserId: existing.migratedFromUserId ?? (existing.userId === legacy.userId ? legacy.migratedFromUserId : legacy.userId),
      ageConfirmedAt: existing.ageConfirmedAt ?? legacy.ageConfirmedAt,
      tosAcceptedAt: existing.tosAcceptedAt ?? legacy.tosAcceptedAt,
      updatedAt: Date.now(),
    }));
    return this.applyLegacyPetalFloor(merged, legacy);
  }

  private legacyImportRefIds(legacyUserId: string): string[] {
    return [`redis-import:${legacyUserId}`, `legacy-redis:${legacyUserId}`];
  }

  private async applyLegacyPetalFloor(user: StoredUser, legacy: StoredUser): Promise<StoredUser> {
    const repaired = (await this.withWalletFloor(user)) ?? user;
    if (legacy.petals <= repaired.petals) return repaired;

    const replayed = await this.repository.findWalletReplay(repaired.userId, this.legacyImportRefIds(legacy.userId));
    if (replayed) return (await this.withWalletFloor(replayed)) ?? replayed;

    const funded = await this.repository.applyWalletDelta({
      userId: repaired.userId,
      delta: legacy.petals - repaired.petals,
      reason: 'legacy-import',
      refId: `redis-import:${legacy.userId}`,
    });
    return (await this.withWalletFloor(funded ?? repaired)) ?? repaired;
  }

  private async uniqueRepositoryUsername(input: string): Promise<string> {
    const base = this.cleanUsername(input);
    const existing = await this.repository.findByUsername(base);
    if (!existing) return base;
    for (let i = 2; i < 1000; i++) {
      const candidate = `${base}${i}`;
      if (!(await this.repository.findByUsername(candidate))) return candidate;
    }
    return `${base}${Date.now().toString(36)}`;
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
