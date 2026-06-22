import express, { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import type { AvatarConfig } from '@social-square/shared';
import { UserService, type GoogleProfile, type StoredUser } from '../../services/UserService';

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

function profilePayload(user: StoredUser): object {
  return {
    userId: user.userId,
    username: user.username,
    petals: user.petals,
    avatarConfig: avatarForUser(user),
    provider: user.provider,
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

  const delta = typeof req.body?.delta === 'number' ? Math.trunc(req.body.delta) : NaN;
  if (!Number.isFinite(delta) || Math.abs(delta) > 1000) {
    res.status(400).json({ error: 'Delta petali non valido' });
    return;
  }

  const next = await userService.adjustPetals(user.userId, delta);
  res.json({ petals: next?.petals ?? user.petals });
};

const loginHandler: RequestHandler = async (req, res) => {
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
    res.status(401).json({ error: 'Password errata' });
    return;
  }

  res.json({
    token: tokenFor(result.user),
    isNew: result.isNew,
    ...profilePayload(result.user),
  });
};

const googleStartHandler: RequestHandler = (req, res) => {
  if (!GOOGLE_ENABLED) {
    res.redirect(`${CLIENT_URL}?authError=${encodeURIComponent('Google non configurato')}`);
    return;
  }

  const state = jwt.sign({
    createdAt: Date.now(),
    clientUrl: clientUrlFromRequest(req),
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
    res.redirect(redirect.toString());
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Errore Google';
    res.redirect(`${CLIENT_URL}?authError=${encodeURIComponent(message)}`);
  }
};

router.get('/config', configHandler);
router.get('/me', meHandler);
router.post('/petals', petalsHandler);
router.post('/login', loginHandler);
router.get('/google/start', googleStartHandler);
router.get('/google/callback', googleCallbackHandler);

export { router as authRouter };
