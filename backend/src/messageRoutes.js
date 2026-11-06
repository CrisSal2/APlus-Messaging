// src/messageRoutes.js
import express from 'express';
import rateLimit from 'express-rate-limit';
import { supabase } from './supabaseClient.js';
import { authRequired } from './middleware/auth.js';
import { boardAccessRequired } from './middleware/boardAccess.js';

const router = express.Router();

const MAX_CONTENT_LENGTH = 4000;
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;
const COLUMNS = 'id, board_id, sender_id, content, created_at';

// Per-user limit on sending (runs after authRequired, so req.user is set)
const sendLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  keyGenerator: (req) => req.user.id,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many messages. Slow down.' },
});

// Create a message
router.post('/', authRequired, sendLimiter, boardAccessRequired, async (req, res) => {
  const { boardId, content } = req.body;

  if (typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ ok: false, error: 'content must be a non-empty string.' });
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    return res
      .status(400)
      .json({ ok: false, error: `content must be at most ${MAX_CONTENT_LENGTH} characters.` });
  }

  const { data, error } = await supabase
    .from('messages')
    .insert([{ board_id: boardId, sender_id: req.user.id, content: content.trim() }])
    .select(COLUMNS)
    .single();

  if (error) throw error;
  return res.status(201).json({ ok: true, message: data });
});

// Get messages for a board.
//   ?after=<ISO timestamp>  -> messages created at/after that time (ascending)
//   otherwise               -> the latest `limit` messages (ascending)
router.get('/:boardId', authRequired, boardAccessRequired, async (req, res) => {
  const { boardId } = req.params;
  const { after } = req.query;

  let limit = Number.parseInt(req.query.limit, 10);
  if (!Number.isInteger(limit) || limit < 1) limit = DEFAULT_LIMIT;
  limit = Math.min(limit, MAX_LIMIT);

  let query = supabase.from('messages').select(COLUMNS).eq('board_id', boardId);

  if (after !== undefined) {
    if (typeof after !== 'string' || Number.isNaN(Date.parse(after))) {
      return res.status(400).json({ ok: false, error: 'after must be an ISO timestamp.' });
    }
    query = query.gte('created_at', after).order('created_at', { ascending: true }).limit(limit);
  } else {
    query = query.order('created_at', { ascending: false }).limit(limit);
  }

  const { data, error } = await query;
  if (error) throw error;

  const messages = after !== undefined ? data : [...data].reverse();
  return res.json({ ok: true, messages });
});

export default router;
