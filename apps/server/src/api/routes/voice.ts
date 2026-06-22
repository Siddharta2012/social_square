import express, { RequestHandler } from 'express';
import { env } from '../../config/env';
import { moderationService } from '../../services/ModerationService';
import { generateVoiceToken, isLiveKitConfigured } from '../../services/VoiceService';
import { state } from '../../socket/handlers/roomContext';
import { userFromAuthHeader } from '../authenticate';

const router: express.Router = express.Router();

function baseRoomId(voiceRoomId: string): string {
  return voiceRoomId.split(':')[0] || voiceRoomId;
}

const tokenHandler: RequestHandler = async (req, res) => {
  if (!isLiveKitConfigured()) {
    res.status(503).json({ error: 'Voice chat non configurata' });
    return;
  }

  const user = await userFromAuthHeader(req);
  if (!user) {
    res.status(401).json({ error: 'Token non valido' });
    return;
  }

  const { roomId } = req.query as { roomId?: string };
  if (!roomId) {
    res.status(400).json({ error: 'roomId richiesto' });
    return;
  }

  const roomState = await state.getRoomState(baseRoomId(roomId));
  for (const peer of roomState.users) {
    if (peer.userId !== user.userId && await moderationService.hasEitherBlock(user.userId, peer.userId)) {
      res.status(403).json({ error: 'VOICE_BLOCKED' });
      return;
    }
  }

  const voiceToken = await generateVoiceToken(user.userId, user.username, roomId);
  res.json({ token: voiceToken, url: env.LIVEKIT_URL });
};

router.get('/token', tokenHandler);

export { router as voiceRouter };
