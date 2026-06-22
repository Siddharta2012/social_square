import express, { RequestHandler } from 'express';
import { moderationService } from '../../services/ModerationService';
import { requireAdmin } from '../../utils/httpSecurity';
import { userFromAuthHeader } from '../authenticate';

const router: express.Router = express.Router();

function safeUserId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= 100 ? value : null;
}

const blockHandler: RequestHandler = async (req, res) => {
  const user = await userFromAuthHeader(req);
  if (!user) {
    res.status(401).json({ error: 'AUTH_REQUIRED' });
    return;
  }
  const targetUserId = safeUserId(req.body?.userId);
  if (!targetUserId || targetUserId === user.userId) {
    res.status(400).json({ error: 'INVALID_TARGET' });
    return;
  }
  await moderationService.blockUser(user.userId, targetUserId);
  res.json({ ok: true });
};

const unblockHandler: RequestHandler = async (req, res) => {
  const user = await userFromAuthHeader(req);
  if (!user) {
    res.status(401).json({ error: 'AUTH_REQUIRED' });
    return;
  }
  const targetUserId = safeUserId(req.body?.userId);
  if (!targetUserId) {
    res.status(400).json({ error: 'INVALID_TARGET' });
    return;
  }
  await moderationService.unblockUser(user.userId, targetUserId);
  res.json({ ok: true });
};

const reportHandler: RequestHandler = async (req, res) => {
  const user = await userFromAuthHeader(req);
  if (!user) {
    res.status(401).json({ error: 'AUTH_REQUIRED' });
    return;
  }
  const reportedId = safeUserId(req.body?.userId);
  const category = typeof req.body?.category === 'string' ? req.body.category : 'general';
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message) {
    res.status(400).json({ error: 'REPORT_MESSAGE_REQUIRED' });
    return;
  }
  const context = req.body?.context && typeof req.body.context === 'object'
    ? req.body.context as Record<string, unknown>
    : {};
  const reportId = await moderationService.createReport(user.userId, reportedId, category, message, context);
  res.json({ ok: true, reportId });
};

const reportsHandler: RequestHandler = async (req, res) => {
  const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 50;
  res.json({ reports: await moderationService.recentReports(limit) });
};

router.post('/block', blockHandler);
router.post('/unblock', unblockHandler);
router.post('/report', reportHandler);
router.get('/reports', requireAdmin, reportsHandler);

export { router as moderationRouter };
