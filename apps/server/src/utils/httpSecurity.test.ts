import { describe, expect, it, vi } from 'vitest';
import { requireAdmin, securityHeaders } from './httpSecurity';

interface ResponseDouble {
  setHeader: (key: string, value: string) => ResponseDouble;
  status: (code: number) => ResponseDouble;
  json: (body: unknown) => ResponseDouble;
}

function responseDouble() {
  const headers = new Map<string, string>();
  const res: ResponseDouble = {
    setHeader: vi.fn((key: string, value: string) => {
      headers.set(key, value);
      return res;
    }),
    status: vi.fn((_code: number) => res),
    json: vi.fn((_body: unknown) => res),
  };
  return { headers, res };
}

describe('HTTP security middleware', () => {
  it('sets CSP and frame/content hardening headers', () => {
    const { headers, res } = responseDouble();
    const next = vi.fn();

    securityHeaders({} as never, res as never, next);

    expect(headers.get('Content-Security-Policy')).toContain("default-src 'self'");
    expect(headers.get('X-Frame-Options')).toBe('DENY');
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(next).toHaveBeenCalledOnce();
  });

  it('rejects admin access when no admin token is configured', () => {
    const { res } = responseDouble();
    const next = vi.fn();
    const req = { get: vi.fn(() => undefined) };

    requireAdmin(req as never, res as never, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'ADMIN_REQUIRED' });
    expect(next).not.toHaveBeenCalled();
  });
});
