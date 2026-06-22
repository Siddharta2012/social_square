import express, { RequestHandler } from 'express';
import { privateRoomService } from '../../services/PrivateRoomService';
import { userFromAuthHeader } from '../authenticate';

const router: express.Router = express.Router();

const createPrivateRoomHandler: RequestHandler = async (req, res) => {
  const user = await userFromAuthHeader(req);
  if (!user) {
    res.status(401).json({ error: 'AUTH_REQUIRED' });
    return;
  }
  res.json({ room: await privateRoomService.create(user.userId) });
};

const joinPrivateRoomHandler: RequestHandler = async (req, res) => {
  const user = await userFromAuthHeader(req);
  if (!user) {
    res.status(401).json({ error: 'AUTH_REQUIRED' });
    return;
  }
  const code = typeof req.body?.code === 'string' ? req.body.code : '';
  const room = await privateRoomService.joinByCode(user.userId, code);
  if (!room) {
    res.status(404).json({ error: 'PRIVATE_ROOM_NOT_FOUND' });
    return;
  }
  res.json({ room });
};

router.post('/create', createPrivateRoomHandler);
router.post('/join', joinPrivateRoomHandler);

export { router as privateRoomsRouter };
