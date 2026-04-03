// src/inviteRoutes.js
import express from 'express';
import crypto from 'crypto';
import { supabase } from './supabaseClient.js';
import { authRequired } from './middleware/auth.js';

const router = express.Router();

// Create an invite (ADMIN ONLY)
router.post('/', authRequired, async (req, res) => {
  try {
    // Only admins can create invites
    if (req.user.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Admins only' });
    }

    const { email, boardId, expiresInDays = 7 } = req.body;

    if (!email || !boardId) {
      return res.status(400).json({
        ok: false,
        error: 'email and boardId are required',
      });
    }

    // Create a secure random token
    const token = crypto.randomBytes(32).toString('hex');

    // Expiration date (default 7 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + Number(expiresInDays));

    // Optional: if you want to prevent multiple active invites for same email+board,
    // you could mark older invites as used/expired here (not required right now).

    const { data, error } = await supabase
      .from('invites')
      .insert([
        {
          token,
          email: email.toLowerCase().trim(),
          board_id: boardId,
          created_by: req.user.id,
          expires_at: expiresAt.toISOString(),
        },
      ])
      .select('*')
      .single();

    if (error) {
      console.error('Invite insert error:', error);
      return res.status(500).json({ ok: false, error: error.message });
    }

    // In a real app: you would email a link like:
    // https://aplus-messaging.com/signup?token=...
    // For now, we just return the token so you can test in Thunder Client.
    return res.status(201).json({
      ok: true,
      invite: {
        id: data.id,
        token: data.token,
        email: data.email,
        board_id: data.board_id,
        expires_at: data.expires_at,
        created_at: data.created_at,
      },
    });
  } catch (err) {
    console.error('Unexpected error creating invite:', err);
    return res.status(500).json({ ok: false, error: 'Unexpected server error' });
  }
});

export default router;
