import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { UserService } from './UserService';
import { MemoryUserRepository } from './UserService.testSupport';

describe('UserService Google auth persistence', () => {
  it('persists age and ToS consent for password registrations', async () => {
    const service = new UserService(new MemoryUserRepository());
    const consent = { ageConfirmedAt: Date.now() - 1_000, tosAcceptedAt: Date.now() };

    const user = await service.createPasswordUser(`consent-${randomUUID()}`, 'Password123', consent);

    expect(user.ageConfirmedAt).toBe(consent.ageConfirmedAt);
    expect(user.tosAcceptedAt).toBe(consent.tosAcceptedAt);
  });

  it('reuses the same persistent account for the same Google subject', async () => {
    const service = new UserService(new MemoryUserRepository());
    const sub = `google-${randomUUID()}`;

    const first = await service.loginOrCreateGoogleUser({
      sub,
      email: `${sub}@example.test`,
      name: 'Google Tester',
    });
    const second = await service.loginOrCreateGoogleUser({
      sub,
      email: `${sub}@example.test`,
      name: 'Google Tester Updated',
    });

    expect(first.isNew).toBe(true);
    expect(second.isNew).toBe(false);
    expect(second.user.userId).toBe(first.user.userId);
    expect(second.user.provider).toBe('google');
  });

  it('persists age and ToS consent for new Google accounts', async () => {
    const service = new UserService(new MemoryUserRepository());
    const sub = `google-consent-${randomUUID()}`;
    const consent = { ageConfirmedAt: Date.now() - 1_000, tosAcceptedAt: Date.now() };

    const result = await service.loginOrCreateGoogleUser({
      sub,
      email: `${sub}@example.test`,
      name: 'Google Consent Tester',
    }, consent);

    expect(result.isNew).toBe(true);
    expect(result.user.ageConfirmedAt).toBe(consent.ageConfirmedAt);
    expect(result.user.tosAcceptedAt).toBe(consent.tosAcceptedAt);
  });

  it('increments token version when sessions are revoked', async () => {
    const service = new UserService(new MemoryUserRepository());
    const sub = `logout-${randomUUID()}`;
    const { user } = await service.loginOrCreateGoogleUser({
      sub,
      email: `${sub}@example.test`,
      name: 'Logout Tester',
    });

    const revoked = await service.revokeSessions(user.userId);

    expect(revoked?.tokenVersion).toBe(user.tokenVersion + 1);
  });
});
