import express, { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { generateVoiceToken, isLiveKitConfigured } from '../../services/VoiceService';

const router: express.Router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-prod';

interface JwtPayload { userId: string; username: string; }

const tokenHandler: RequestHandler = async (req, res) => {
  if (!isLiveKitConfigured()) {
    res.status(503).json({ error: 'Voice chat non configurata' });
    return;
  }

  // Read identity from JWT header
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: 'Auth richiesta' });
    return;
  }

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    res.status(401).json({ error: 'Token non valido' });
    return;
  }

  const { roomId } = req.query as { roomId?: string };
  if (!roomId) {
    res.status(400).json({ error: 'roomId richiesto' });
    return;
  }

  const voiceToken = await generateVoiceToken(payload.userId, payload.username, roomId);
  res.json({ token: voiceToken, url: process.env.LIVEKIT_URL });
};

router.get('/token', tokenHandler);

export { router as voiceRouter };
