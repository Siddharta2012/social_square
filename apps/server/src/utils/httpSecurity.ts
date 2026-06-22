import { env } from '../config/env';
import type { RequestHandler } from 'express';

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function csp(): string {
  const connectSrc = [
    "'self'",
    originOf(env.CLIENT_URL),
    originOf(env.LIVEKIT_URL),
    'ws:',
    'wss:',
  ].filter(Boolean).join(' ');
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "media-src 'self' blob: data:",
    `connect-src ${connectSrc}`,
    "worker-src 'self' blob:",
    "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
  ].join('; ');
}

export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader('Content-Security-Policy', csp());
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Origin-Agent-Cluster', '?1');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');
  if (env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
};

export const requireAdmin: RequestHandler = (req, res, next) => {
  const header = req.get('authorization');
  const bearer = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : null;
  const supplied = bearer ?? req.get('x-admin-token') ?? null;
  if (!env.ADMIN_TOKEN || supplied !== env.ADMIN_TOKEN) {
    res.status(env.NODE_ENV === 'production' ? 404 : 401).json({ error: 'ADMIN_REQUIRED' });
    return;
  }
  next();
};
