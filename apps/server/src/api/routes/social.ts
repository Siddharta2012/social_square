import express, { RequestHandler } from 'express';
import { socialService } from '../../services/SocialService';
import { userFromAuthHeader } from '../authenticate';

const router: express.Router = express.Router();

const friendsHandler: RequestHandler = async (req, res) => {
  const user = await userFromAuthHeader(req);
  if (!user) {
    res.status(401).json({ error: 'AUTH_REQUIRED' });
    return;
  }
  res.json({ friends: await socialService.listFriends(user.userId) });
};

const requestFriendHandler: RequestHandler = async (req, res) => {
  const user = await userFromAuthHeader(req);
  if (!user) {
    res.status(401).json({ error: 'AUTH_REQUIRED' });
    return;
  }
  const targetUserId = typeof req.body?.userId === 'string' ? req.body.userId : '';
  const friend = await socialService.sendFriendRequest(user.userId, targetUserId);
  if (!friend) {
    res.status(400).json({ error: 'FRIEND_REQUEST_FAILED' });
    return;
  }
  res.json({ friend });
};

const acceptFriendHandler: RequestHandler = async (req, res) => {
  const user = await userFromAuthHeader(req);
  if (!user) {
    res.status(401).json({ error: 'AUTH_REQUIRED' });
    return;
  }
  const requesterId = typeof req.body?.userId === 'string' ? req.body.userId : '';
  const accepted = await socialService.acceptFriendRequest(user.userId, requesterId);
  res.status(accepted ? 200 : 404).json({ accepted });
};

const rejectFriendHandler: RequestHandler = async (req, res) => {
  const user = await userFromAuthHeader(req);
  if (!user) {
    res.status(401).json({ error: 'AUTH_REQUIRED' });
    return;
  }
  const requesterId = typeof req.body?.userId === 'string' ? req.body.userId : '';
  const rejected = await socialService.rejectFriendRequest(user.userId, requesterId);
  res.status(rejected ? 200 : 404).json({ rejected });
};

router.get('/friends', friendsHandler);
router.post('/friends/request', requestFriendHandler);
router.post('/friends/accept', acceptFriendHandler);
router.post('/friends/reject', rejectFriendHandler);

export { router as socialRouter };
