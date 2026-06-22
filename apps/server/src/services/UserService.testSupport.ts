import {
  statsAfterWalletDelta,
  type StoredUser,
  type UserRepository,
  type WalletInvariant,
  type WalletMutation,
} from './UserService';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class MemoryUserRepository implements UserRepository {
  readonly users = new Map<string, StoredUser>();
  readonly ledger: WalletMutation[] = [];
  writeCount = 0;

  private queue: Promise<unknown> = Promise.resolve();

  findById(userId: string): Promise<StoredUser | null> {
    return Promise.resolve(this.copy(this.users.get(userId)));
  }

  findByUsername(username: string): Promise<StoredUser | null> {
    const match = [...this.users.values()].find((user) => user.username.toLowerCase() === username.toLowerCase());
    return Promise.resolve(this.copy(match));
  }

  findByGoogleSub(sub: string): Promise<StoredUser | null> {
    const match = [...this.users.values()].find((user) => user.googleSub === sub);
    return Promise.resolve(this.copy(match));
  }

  findByEmail(email: string): Promise<StoredUser | null> {
    const match = [...this.users.values()].find((user) => user.email?.toLowerCase() === email.toLowerCase());
    return Promise.resolve(this.copy(match));
  }

  createUser(user: StoredUser): Promise<StoredUser> {
    if ([...this.users.values()].some((existing) => existing.username.toLowerCase() === user.username.toLowerCase())) {
      throw new Error('DUPLICATE_USERNAME');
    }
    this.writeCount += 1;
    this.users.set(user.userId, clone(user));
    return Promise.resolve(clone(user));
  }

  updateUser(user: StoredUser): Promise<StoredUser> {
    if (!this.users.has(user.userId)) throw new Error('USER_NOT_FOUND');
    this.writeCount += 1;
    this.users.set(user.userId, clone(user));
    return Promise.resolve(clone(user));
  }

  applyWalletDelta(mutation: WalletMutation): Promise<StoredUser | null> {
    return this.locked(async () => {
      const replay = this.ledger.find((entry) => entry.userId === mutation.userId && entry.refId === mutation.refId);
      if (replay) return this.copy(this.users.get(mutation.userId));

      const user = this.users.get(mutation.userId);
      if (!user) return null;
      const nextPetals = user.petals + mutation.delta;
      if (nextPetals < 0) return null;

      const next = {
        ...clone(user),
        petals: nextPetals,
        stats: statsAfterWalletDelta(user.stats, Math.abs(mutation.delta), mutation.reason),
        updatedAt: Date.now(),
      };
      this.ledger.push({ ...mutation });
      this.users.set(mutation.userId, next);
      this.writeCount += 1;
      return clone(next);
    });
  }

  purchaseCosmetic(userId: string, itemId: string, price: number, refId: string): Promise<StoredUser | null> {
    return this.locked(async () => {
      const replay = this.ledger.find((entry) => entry.userId === userId && entry.refId === refId);
      if (replay) return this.copy(this.users.get(userId));
      const user = this.users.get(userId);
      if (!user) return null;
      if (user.unlockedItems.includes(itemId)) return clone(user);
      const cost = Math.max(0, Math.trunc(price));
      if (user.petals < cost) return null;
      const next = {
        ...clone(user),
        petals: user.petals - cost,
        unlockedItems: [...user.unlockedItems, itemId],
        stats: statsAfterWalletDelta(user.stats, cost, 'cosmetic'),
        updatedAt: Date.now(),
      };
      this.ledger.push({ userId, delta: -cost, reason: 'cosmetic', refId });
      this.users.set(userId, next);
      this.writeCount += 1;
      return clone(next);
    });
  }

  walletInvariant(userId: string): Promise<WalletInvariant | null> {
    const user = this.users.get(userId);
    if (!user) return Promise.resolve(null);
    const ledgerSum = this.ledger
      .filter((entry) => entry.userId === userId)
      .reduce((sum, entry) => sum + entry.delta, 0);
    return Promise.resolve({ userPetals: user.petals, ledgerSum });
  }

  repairWalletFloor(userId: string): Promise<StoredUser | null> {
    const user = this.users.get(userId);
    if (!user) return Promise.resolve(null);
    const ledgerSum = this.ledger
      .filter((entry) => entry.userId === userId)
      .reduce((sum, entry) => sum + entry.delta, 0);
    if (ledgerSum <= user.petals) return Promise.resolve(clone(user));
    const next = { ...clone(user), petals: ledgerSum, updatedAt: Date.now() };
    this.users.set(userId, next);
    this.writeCount += 1;
    return Promise.resolve(clone(next));
  }

  revokeSessions(userId: string): Promise<StoredUser | null> {
    const user = this.users.get(userId);
    if (!user) return Promise.resolve(null);
    const next = { ...clone(user), tokenVersion: user.tokenVersion + 1, updatedAt: Date.now() };
    this.users.set(userId, next);
    this.writeCount += 1;
    return Promise.resolve(clone(next));
  }

  resetWriteCount(): void {
    this.writeCount = 0;
  }

  private copy(user: StoredUser | undefined): StoredUser | null {
    return user ? clone(user) : null;
  }

  private locked<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }
}
