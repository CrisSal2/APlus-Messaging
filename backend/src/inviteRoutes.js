// src/inviteRoutes.js
import express from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { supabase } from './supabaseClient.js';
import { authRequired } from './middleware/auth.js';
import { adminRequired } from './middleware/adminRequired.js';
import { coordinatorRequired } from './middleware/boardAccess.js';
import { normalizeEmail, isValidEmail } from './utils/validate.js';

const router = express.Router();

const MAX_EXPIRY_DAYS = 30;
const DEFAULT_EXPIRY_DAYS = 7;

// Until invite emails are sent, the API returns the token so it can be shared
// manually. Disabled by default in production; opt in with INVITE_RETURN_TOKEN=true.
const returnToken =
  process.env.INVITE_RETURN_TOKEN != null
    ? process.env.INVITE_RETURN_TOKEN === 'true'
    : process.env.NODE_ENV !== 'production';

const inviteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  keyGenerator: (req) => req.user.id,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many invites. Try again later.' },
});

// Create an invite (coordinators of the target board only)
router.post('/', authRequired, adminRequired, inviteLimiter, coordinatorRequired, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { boardId } = req.body;
  const expiresInDays = req.body.expiresInDays ?? DEFAULT_EXPIRY_DAYS;

  if (!isValidEmail(email)) {
    return res.status(400).json({ ok: false, error: 'A valid email is required.' });
  }
  if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > MAX_EXPIRY_DAYS) {
    return res
      .status(400)
      .json({ ok: false, error: `expiresInDays must be an integer from 1 to ${MAX_EXPIRY_DAYS}.` });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from('invites')
    .insert([
      {
        token,
        email,
        board_id: boardId,
        created_by: req.user.id,
        expires_at: expiresAt.toISOString(),
      },
    ])
    .select('id, token, email, board_id, expires_at, created_at')
    .single();
  if (error) throw error;

  // TODO: email a link like https://<app-host>/signup?token=... to the client
  const { token: inviteToken, ...rest } = data;
  return res.status(201).json({
    ok: true,
    invite: returnToken ? { ...rest, token: inviteToken } : rest,
  });
});

export default router;
