import express, { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import type { AvatarConfig, Position } from '@social-square/shared';
import { UserService, type GoogleProfile, type StoredUser } from '../../services/UserService';
import { authRateLimiter } from '../../utils/rateLimit';
import { logInfo, logWarn } from '../../utils/logger';

const router: express.Router = express.Router();
const userService = new UserService();

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-prod';
const JWT_EXPIRES = '7d';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3000/api/auth/google/callback';
const CLIENT_URL = process.env.CLIENT_URL ?? 'http://localhost:5173';
const GOOGLE_ENABLED = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
const DEV_PASSWORD_LOGIN = process.env.ALLOW_PASSWORD_LOGIN === 'true' ||
  (!GOOGLE_ENABLED && process.env.NODE_ENV !== 'production');

interface JwtPayload {
  userId: string;
  username: string;
}

interface GoogleStatePayload {
  createdAt: number;
  clientUrl?: string;
}

function tokenFor(user: StoredUser): string {
  return jwt.sign(
    { userId: user.userId, username: user.username },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES },
  );
}

function avatarForUser(user: StoredUser): AvatarConfig {
  return user.avatarConfig ?? {
    userId: user.userId,
    username: user.username,
    body: 0,
    outfit: 0,
    hair: 0,
    hairColor: '#4488ff',
    accessory: 0,
    expression: 0,
  };
}

function sanitizeAvatarConfig(user: StoredUser, value: unknown): AvatarConfig | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<AvatarConfig>;
  const nums = [raw.body, raw.outfit, raw.hair, raw.accessory, raw.expression];
  if (nums.some((part) => typeof part !== 'number' || !Number.isFinite(part))) return null;
  if (typeof raw.hairColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(raw.hairColor)) return null;
  return {
    userId: user.userId,
    username: user.username,
    body: Math.max(0, Math.trunc(raw.body!)),
    outfit: Math.max(0, Math.trunc(raw.outfit!)),
    hair: Math.max(0, Math.trunc(raw.hair!)),
    hairColor: raw.hairColor,
    accessory: Math.max(0, Math.trunc(raw.accessory!)),
    expression: Math.max(0, Math.trunc(raw.expression!)),
  };
}

function sanitizePosition(value: unknown): (Position & { roomId: string; locationId?: string; updatedAt: number }) | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<Position & { roomId: string; locationId?: string }>;
  if (
    typeof raw.roomId !== 'string' ||
    typeof raw.x !== 'number' ||
    typeof raw.y !== 'number' ||
    !Number.isFinite(raw.x) ||
    !Number.isFinite(raw.y)
  ) return null;
  return {
    roomId: raw.roomId,
    x: raw.x,
    y: raw.y,
    locationId: typeof raw.locationId === 'string' ? raw.locationId : undefined,
    updatedAt: Date.now(),
  };
}

function profilePayload(user: StoredUser): object {
  return {
    userId: user.userId,
    username: user.username,
    petals: user.petals,
    avatarConfig: avatarForUser(user),
    position: user.position ?? null,
    unlockedItems: user.unlockedItems,
    stats: user.stats,
    provider: user.provider,
    email: user.email,
    displayName: user.displayName,
    picture: user.picture,
  };
}

function clientUrlFromRequest(req: express.Request): string {
  const referer = req.get('referer');
  if (!referer) return CLIENT_URL;
  try {
    return new URL(referer).origin;
  } catch {
    return CLIENT_URL;
  }
}

function clientKey(req: express.Request): string {
  return req.ip || req.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

function rateLimitAuth(req: express.Request, res: express.Response, key: string, limit: number, windowMs: number): boolean {
  const result = authRateLimiter.hit(`auth:${key}:${clientKey(req)}`, limit, windowMs);
  if (result.allowed) return false;
  res.status(429).json({ error: 'RATE_LIMIT', retryAfterMs: result.retryAfterMs });
  logWarn('auth.rate_limited', { key, ip: clientKey(req), retryAfterMs: result.retryAfterMs });
  return true;
}

async function userFromRequest(req: express.Request): Promise<StoredUser | null> {
  const auth = req.headers.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;

  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    return userService.findById(payload.userId);
  } catch {
    return null;
  }
}

const configHandler: RequestHandler = (_req, res) => {
  res.json({
    googleEnabled: GOOGLE_ENABLED,
    devPasswordLogin: DEV_PASSWORD_LOGIN,
  });
};

const meHandler: RequestHandler = async (req, res) => {
  const user = await userFromRequest(req);
  if (!user) {
    res.status(401).json({ error: 'AUTH_REQUIRED' });
    return;
  }
  res.json(profilePayload(user));
};

const petalsHandler: RequestHandler = async (req, res) => {
  const user = await userFromRequest(req);
  if (!user) {
    res.status(401).json({ error: 'AUTH_REQUIRED' });
    return;
  }

  res.status(410).json({ error: 'WALLET_SERVER_SIDE_ONLY' });
};

const profileHandler: RequestHandler = async (req, res) => {
  const user = await userFromRequest(req);
  if (!user) {
    res.status(401).json({ error: 'AUTH_REQUIRED' });
    return;
  }
  res.json(profilePayload(user));
};

const updateProfileHandler: RequestHandler = async (req, res) => {
  const user = await userFromRequest(req);
  if (!user) {
    res.status(401).json({ error: 'AUTH_REQUIRED' });
    return;
  }

  const avatarConfig = req.body?.avatarConfig === undefined
    ? undefined
    : sanitizeAvatarConfig(user, req.body.avatarConfig);
  const position = req.body?.position === undefined
    ? undefined
    : sanitizePosition(req.body.position);

  if (req.body?.avatarConfig !== undefined && !avatarConfig) {
    res.status(400).json({ error: 'INVALID_AVATAR' });
    return;
  }
  if (req.body?.position !== undefined && !position) {
    res.status(400).json({ error: 'INVALID_POSITION' });
    return;
  }

  const patch: Parameters<UserService['updateProfile']>[1] = {};
  if (avatarConfig) patch.avatarConfig = avatarConfig;
  if (position) patch.position = position;
  const updated = await userService.updateProfile(user.userId, patch);
  res.json(profilePayload(updated ?? user));
};

const updateAvatarHandler: RequestHandler = async (req, res) => {
  const user = await userFromRequest(req);
  if (!user) {
    res.status(401).json({ error: 'AUTH_REQUIRED' });
    return;
  }
  const avatarConfig = sanitizeAvatarConfig(user, req.body?.avatarConfig);
  if (!avatarConfig) {
    res.status(400).json({ error: 'INVALID_AVATAR' });
    return;
  }
  const updated = await userService.updateAvatarConfig(user.userId, avatarConfig);
  res.json(profilePayload(updated ?? user));
};

const dailyPresenceHandler: RequestHandler = async (req, res) => {
  const user = await userFromRequest(req);
  if (!user) {
    res.status(401).json({ error: 'AUTH_REQUIRED' });
    return;
  }
  const result = await userService.claimDailyPresence(user.userId);
  if (!result) {
    res.status(404).json({ error: 'USER_NOT_FOUND' });
    return;
  }
  res.json({
    awarded: result.awarded,
    petals: result.user.petals,
    stats: result.user.stats,
    nextAt: result.nextAt,
  });
};

const logoutHandler: RequestHandler = (_req, res) => {
  res.json({ ok: true });
};

const loginHandler: RequestHandler = async (req, res) => {
  if (rateLimitAuth(req, res, 'login', 8, 60_000)) return;
  if (!DEV_PASSWORD_LOGIN) {
    res.status(403).json({ error: 'Accesso Google richiesto' });
    return;
  }

  const { username, password } = req.body as { username?: string; password?: string };

  if (
    typeof username !== 'string' ||
    typeof password !== 'string' ||
    username.trim().length < 2 ||
    username.trim().length > 30 ||
    password.length < 4
  ) {
    res.status(400).json({ error: 'Username (2-30 chars) e password (min 4) richiesti' });
    return;
  }

  const trimmed = username.trim();
  const result = await userService.loginOrRegister(trimmed, password);

  if (!result) {
    logWarn('auth.password_failed', { username: trimmed, ip: clientKey(req) });
    res.status(401).json({ error: 'Password errata' });
    return;
  }

  logInfo('auth.password_login', { userId: result.user.userId, isNew: result.isNew });
  res.json({
    token: tokenFor(result.user),
    isNew: result.isNew,
    ...profilePayload(result.user),
  });
};

const googleStartHandler: RequestHandler = (req, res) => {
  if (rateLimitAuth(req, res, 'google_start', 20, 60_000)) return;
  const clientUrl = clientUrlFromRequest(req);
  if (!GOOGLE_ENABLED) {
    res.redirect(`${clientUrl}?authError=${encodeURIComponent('Google non configurato')}`);
    return;
  }

  const state = jwt.sign({
    createdAt: Date.now(),
    clientUrl,
  }, JWT_SECRET, { expiresIn: '10m' });
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID!,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
};

const googleCallbackHandler: RequestHandler = async (req, res) => {
  if (rateLimitAuth(req, res, 'google_callback', 20, 60_000)) return;
  if (!GOOGLE_ENABLED) {
    res.redirect(`${CLIENT_URL}?authError=${encodeURIComponent('Google non configurato')}`);
    return;
  }

  const code = typeof req.query.code === 'string' ? req.query.code : null;
  const state = typeof req.query.state === 'string' ? req.query.state : null;
  if (!code || !state) {
    res.redirect(`${CLIENT_URL}?authError=${encodeURIComponent('Callback Google non valida')}`);
    return;
  }

  try {
    const statePayload = jwt.verify(state, JWT_SECRET) as GoogleStatePayload;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID!,
        client_secret: GOOGLE_CLIENT_SECRET!,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) throw new Error(`Google token exchange failed: ${tokenRes.status}`);
    const tokenData = await tokenRes.json() as { access_token?: string };
    if (!tokenData.access_token) throw new Error('Google access token mancante');

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!profileRes.ok) throw new Error(`Google userinfo failed: ${profileRes.status}`);

    const profile = await profileRes.json() as GoogleProfile;
    if (!profile.sub) throw new Error('Profilo Google senza subject');

    const result = await userService.loginOrCreateGoogleUser(profile);
    const appToken = tokenFor(result.user);
    const redirect = new URL(statePayload.clientUrl ?? CLIENT_URL);
    redirect.searchParams.set('authToken', appToken);
    redirect.searchParams.set('start', '1');
    logInfo('auth.google_login', { userId: result.user.userId, isNew: result.isNew });
    res.redirect(redirect.toString());
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Errore Google';
    logWarn('auth.google_failed', { message });
    res.redirect(`${CLIENT_URL}?authError=${encodeURIComponent(message)}`);
  }
};

router.get('/config', configHandler);
router.get('/me', meHandler);
router.post('/petals', petalsHandler);
router.get('/profile', profileHandler);
router.patch('/profile', updateProfileHandler);
router.patch('/profile/avatar', updateAvatarHandler);
router.post('/profile/daily', dailyPresenceHandler);
router.post('/logout', logoutHandler);
router.post('/login', loginHandler);
router.get('/google/start', googleStartHandler);
router.get('/google/callback', googleCallbackHandler);

export { router as authRouter };
