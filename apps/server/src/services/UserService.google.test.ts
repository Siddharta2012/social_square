import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { UserService } from './UserService';

describe('UserService Google auth persistence', () => {
  it('reuses the same persistent account for the same Google subject', async () => {
    const service = new UserService();
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
});
