import express, { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { UserService } from '../../services/UserService';

const router: express.Router = express.Router();
const userService = new UserService();

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-prod';
const JWT_EXPIRES = '7d';

const loginHandler: RequestHandler = async (req, res) => {
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

  const token = jwt.sign(
    { userId: result.user.userId, username: result.user.username },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES },
  );

  res.json({
    token,
    userId: result.user.userId,
    username: result.user.username,
    isNew: result.isNew,
  });
};

router.post('/login', loginHandler);

export { router as authRouter };
