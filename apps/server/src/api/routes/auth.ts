import { createHash, randomBytes } from 'node:crypto';
import { ownsAvatarConfig } from '@social-square/shared';
import express, { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { UserService, type ConsentRecord, type GoogleProfile, type StoredUser } from '../../services/UserService';
import { logInfo, logWarn } from '../../utils/logger';
import { authRateLimiter } from '../../utils/rateLimit';
import type { AvatarConfig, Position, UserProgressSnapshot } from '@social-square/shared';

const router: express.Router = express.Router();
const userService = new UserService();

const JWT_EXPIRES = env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'];
const GOOGLE_CLIENT_ID = env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = env.GOOGLE_REDIRECT_URI ?? `http://localhost:${env.PORT}/api/auth/google/callback`;
const CLIENT_URL = env.CLIENT_URL;
const GOOGLE_ENABLED = env.GOOGLE_ENABLED;
const DEV_PASSWORD_LOGIN = env.ALLOW_PASSWORD_LOGIN || (!GOOGLE_ENABLED && env.NODE_ENV !== 'production');

interface JwtPayload {
  userId: string;
  username: string;
  tokenVersion: number;
}

interface GoogleStatePayload {
  createdAt: number;
  clientUrl?: string;
  nonce: string;
  ageConfirmedAt?: number;
  tosAcceptedAt?: number;
}

interface GoogleCookiePayload {
  nonce: string;
  codeVerifier: string;
}

function tokenFor(user: StoredUser): string {
  return jwt.sign(
    { userId: user.userId, username: user.username, tokenVersion: user.tokenVersion },
    env.JWT_SECRET,
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

function profilePayload(user: StoredUser, progress?: UserProgressSnapshot | null): object {
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
    progress: progress ?? null,
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

async function rateLimitAuth(req: express.Request, res: express.Response, key: string, limit: number, windowMs: number): Promise<boolean> {
  const result = await authRateLimiter.hitShared(`auth:${key}:${clientKey(req)}`, limit, windowMs);
  if (result.allowed) return false;
  res.status(429).json({ error: 'RATE_LIMIT', retryAfterMs: result.retryAfterMs });
  logWarn('auth.rate_limited', { key, ip: clientKey(req), retryAfterMs: result.retryAfterMs });
  return true;
}

function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'PASSWORD_TOO_SHORT';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'PASSWORD_TOO_WEAK';
  return null;
}

function consentFromFlags(ageConfirmed: unknown, tosAccepted: unknown): ConsentRecord | null {
  if (ageConfirmed !== true || tosAccepted !== true) return null;
  const now = Date.now();
  return { ageConfirmedAt: now, tosAcceptedAt: now };
}

function consentFromBody(req: express.Request): ConsentRecord | null {
  return consentFromFlags(req.body?.ageConfirmed, req.body?.tosAccepted);
}

function consentFromQuery(req: express.Request): ConsentRecord | null {
  return consentFromFlags(req.query.age === '1', req.query.tos === '1');
}

function credentials(req: express.Request): { username: string; password: string } | null {
  const { username, password } = req.body as { username?: string; password?: string };
  if (
    typeof username !== 'string' ||
    typeof password !== 'string' ||
    username.trim().length < 2 ||
    username.trim().length > 30
  ) return null;
  return { username: username.trim(), password };
}

function cookieValue(req: express.Request, name: string): string | null {
  const cookie = req.get('cookie');
  if (!cookie) return null;
  for (const part of cookie.split(';')) {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (rawKey === name) return decodeURIComponent(rawValue.join('='));
  }
  return null;
}

function googleCookie(value: string, maxAgeSeconds: number): string {
  const secure = env.NODE_ENV === 'production' ? '; Secure' : '';
  return `ss_google_oauth=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=${maxAgeSeconds}${secure}`;
}

function clearGoogleCookie(): string {
  const secure = env.NODE_ENV === 'production' ? '; Secure' : '';
  return `ss_google_oauth=; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=0${secure}`;
}

function codeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

async function userFromRequest(req: express.Request): Promise<StoredUser | null> {
  const auth = req.headers.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    const user = await userService.findById(payload.userId);
    if (!user || payload.tokenVersion !== user.tokenVersion) return null;
    return user;
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
  res.json(profilePayload(user, await userService.getProgress(user.userId)));
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
  res.json(profilePayload(user, await userService.getProgress(user.userId)));
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
  if (avatarConfig && !ownsAvatarConfig(avatarConfig, user.unlockedItems)) {
    res.status(403).json({ error: 'COSMETIC_LOCKED' });
    return;
  }

  const patch: Parameters<UserService['updateProfile']>[1] = {};
  if (avatarConfig) patch.avatarConfig = avatarConfig;
  if (position) patch.position = position;
  const updated = await userService.updateProfile(user.userId, patch);
  const nextUser = updated ?? user;
  res.json(profilePayload(nextUser, await userService.getProgress(nextUser.userId)));
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
  if (!ownsAvatarConfig(avatarConfig, user.unlockedItems)) {
    res.status(403).json({ error: 'COSMETIC_LOCKED' });
    return;
  }
  const updated = await userService.updateAvatarConfig(user.userId, avatarConfig);
  const nextUser = updated ?? user;
  res.json(profilePayload(nextUser, await userService.getProgress(nextUser.userId)));
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
    progress: result.progress,
    nextAt: result.nextAt,
    petalReward: result.petalReward,
    xpGained: result.xpGained,
    levelUp: result.levelUp,
  });
};

const logoutHandler: RequestHandler = async (req, res) => {
  const user = await userFromRequest(req);
  if (!user) {
    res.status(401).json({ error: 'AUTH_REQUIRED' });
    return;
  }
  await userService.revokeSessions(user.userId);
  res.json({ ok: true });
};

const loginHandler: RequestHandler = async (req, res) => {
  if (!DEV_PASSWORD_LOGIN) {
    res.status(403).json({ error: 'Accesso Google richiesto' });
    return;
  }

  const data = credentials(req);
  if (!data) {
    res.status(400).json({ error: 'INVALID_CREDENTIALS' });
    return;
  }

  if (await rateLimitAuth(req, res, `login:${data.username.toLowerCase()}`, 6, 60_000)) return;
  const user = await userService.findByUsername(data.username);

  if (!user || !(await userService.verifyPassword(user, data.password))) {
    logWarn('auth.password_failed', { username: data.username, ip: clientKey(req) });
    res.status(401).json({ error: 'LOGIN_FAILED' });
    return;
  }

  logInfo('auth.password_login', { userId: user.userId });
  res.json({
    token: tokenFor(user),
    isNew: false,
    ...profilePayload(user, await userService.getProgress(user.userId)),
  });
};

const registerHandler: RequestHandler = async (req, res) => {
  if (!DEV_PASSWORD_LOGIN) {
    res.status(403).json({ error: 'Accesso Google richiesto' });
    return;
  }

  const data = credentials(req);
  if (!data) {
    res.status(400).json({ error: 'INVALID_CREDENTIALS' });
    return;
  }
  const weak = passwordProblem(data.password);
  if (weak) {
    res.status(400).json({ error: weak });
    return;
  }
  const consent = consentFromBody(req);
  if (!consent) {
    res.status(400).json({ error: 'CONSENT_REQUIRED' });
    return;
  }
  if (await rateLimitAuth(req, res, `register:${data.username.toLowerCase()}`, 4, 60_000)) return;
  const existing = await userService.findByUsername(data.username);
  if (existing) {
    res.status(409).json({ error: 'USERNAME_TAKEN' });
    return;
  }

  const user = await userService.createPasswordUser(data.username, data.password, consent);
  logInfo('auth.password_register', { userId: user.userId });
  res.json({
    token: tokenFor(user),
    isNew: true,
    ...profilePayload(user, await userService.getProgress(user.userId)),
  });
};

const googleStartHandler: RequestHandler = async (req, res) => {
  if (await rateLimitAuth(req, res, 'google_start', 20, 60_000)) return;
  const clientUrl = clientUrlFromRequest(req);
  if (!GOOGLE_ENABLED) {
    res.redirect(`${clientUrl}?authError=${encodeURIComponent('Google non configurato')}`);
    return;
  }
  const consent = consentFromQuery(req);
  if (!consent) {
    res.redirect(`${clientUrl}?authError=${encodeURIComponent('CONSENT_REQUIRED')}`);
    return;
  }

  const state = jwt.sign({
    createdAt: Date.now(),
    clientUrl,
    nonce: randomBytes(16).toString('base64url'),
    ageConfirmedAt: consent.ageConfirmedAt,
    tosAcceptedAt: consent.tosAcceptedAt,
  }, env.JWT_SECRET, { expiresIn: '10m' });
  const statePayload = jwt.verify(state, env.JWT_SECRET) as GoogleStatePayload;
  const codeVerifier = randomBytes(32).toString('base64url');
  const cookie = jwt.sign({
    nonce: statePayload.nonce,
    codeVerifier,
  }, env.JWT_SECRET, { expiresIn: '10m' });
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID!,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: codeChallenge(codeVerifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  res.setHeader('Set-Cookie', googleCookie(cookie, 600));
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
};

const googleCallbackHandler: RequestHandler = async (req, res) => {
  if (await rateLimitAuth(req, res, 'google_callback', 20, 60_000)) return;
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
    const statePayload = jwt.verify(state, env.JWT_SECRET) as GoogleStatePayload;
    const cookie = cookieValue(req, 'ss_google_oauth');
    if (!cookie) throw new Error('State cookie mancante');
    const cookiePayload = jwt.verify(cookie, env.JWT_SECRET) as GoogleCookiePayload;
    if (cookiePayload.nonce !== statePayload.nonce) throw new Error('State Google non valido');
    res.setHeader('Set-Cookie', clearGoogleCookie());

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID!,
        client_secret: GOOGLE_CLIENT_SECRET!,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
        code_verifier: cookiePayload.codeVerifier,
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

    const consent = statePayload.ageConfirmedAt && statePayload.tosAcceptedAt
      ? { ageConfirmedAt: statePayload.ageConfirmedAt, tosAcceptedAt: statePayload.tosAcceptedAt }
      : undefined;
    const result = await userService.loginOrCreateGoogleUser(profile, consent);
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
router.post('/register', registerHandler);
router.get('/google/start', googleStartHandler);
router.get('/google/callback', googleCallbackHandler);

export { router as authRouter };
