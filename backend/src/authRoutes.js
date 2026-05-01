// src/authRoutes.js
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from './supabaseClient.js';
import { USER_ROLES, BOARD_ROLES } from './constants/roles.js';

const router = express.Router();

// Generate JWT (used after login or signup)
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// -----------------------------
// Client Signup (Invite Only)
// -----------------------------
router.post('/signup', async (req, res) => {
  try {
    const { email, password, token } = req.body;

    // Basic validation
    if (!email || !password || !token) {
      return res.status(400).json({
        ok: false,
        error: 'Email, password, and invite token are required.'
      });
    }

    // 1) Look up invite by token
    const { data: invite, error: inviteError } = await supabase
      .from('invites')
      .select('*')
      .eq('token', token)
      .maybeSingle();

    if (inviteError) {
      console.error(inviteError);
      return res.status(500).json({ ok: false, error: inviteError.message });
    }

    if (!invite) {
      return res.status(400).json({ ok: false, error: 'Invalid invite token.' });
    }

    // 2) Make sure invite is not used
    if (invite.used_at) {
      return res.status(400).json({ ok: false, error: 'Invite token already used.' });
    }

    // 3) Make sure email matches invite email (case-insensitive)
    if (invite.email.toLowerCase() !== email.toLowerCase()) {
      return res.status(400).json({ ok: false, error: 'Invite token does not match this email.' });
    }

    // 4) Make sure invite is not expired (if expires_at is set)
    if (invite.expires_at) {
      const now = new Date();
      const expires = new Date(invite.expires_at);
      if (now > expires) {
        return res.status(400).json({ ok: false, error: 'Invite token expired.' });
      }
    }

    // Check if user already exists
    const existing = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existing.data) {
      return res.status(400).json({ ok: false, error: 'User already exists.' });
    }

    // Hash the password
    const password_hash = await bcrypt.hash(password, 10);

    // Create user
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert([{ email, password_hash, role: USER_ROLES.CLIENT }])
      .select('*')
      .single();

    if (userError) {
      console.error(userError);
      return res.status(500).json({ ok: false, error: userError.message });
    }

    // Link user to board and mark invite as used in parallel (independent operations)
    const [{ error: linkError }, { error: usedError }] = await Promise.all([
      supabase
        .from('board_participants')
        .insert([
          {
            board_id: invite.board_id,
            user_id: user.id,
            role_in_board: BOARD_ROLES.CLIENT
          }
        ]),
      supabase
        .from('invites')
        .update({ used_at: new Date().toISOString() })
        .eq('id', invite.id)
    ]);

    if (linkError) {
      console.error(linkError);
      return res.status(500).json({ ok: false, error: linkError.message });
    }

    if (usedError) {
      console.error(usedError);
      return res.status(500).json({ ok: false, error: usedError.message });
    }

    const jwtToken = generateToken(user);

    // IMPORTANT: do not return password_hash
    return res.json({
      ok: true,
      user: { id: user.id, email: user.email, role: user.role },
      token: jwtToken,
      boardId: invite.board_id
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: 'Unexpected server error' });
  }
});

// -----------------------------
// Client Login
// -----------------------------
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ ok: false, error: 'Email and password required.' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .eq('role', USER_ROLES.CLIENT)
      .maybeSingle();

    if (error || !user) {
      return res.status(400).json({ ok: false, error: 'Invalid credentials.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(400).json({ ok: false, error: 'Invalid credentials.' });
    }

    const jwtToken = generateToken(user);

    // IMPORTANT: do not return password_hash
    return res.json({
      ok: true,
      user: { id: user.id, email: user.email, role: user.role },
      token: jwtToken
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: 'Unexpected server error' });
  }
});

// -----------------------------
// Monday.com App Login
// Validates a Monday.com sessionToken (JWT signed with your app's signing secret)
// and returns a JWT for use with the rest of the API.
//
// Requires in Supabase: ALTER TABLE users ADD COLUMN monday_user_id TEXT UNIQUE;
//                       ALTER TABLE users ADD COLUMN monday_account_id TEXT;
// -----------------------------
router.post('/monday', async (req, res) => {
  try {
    const { sessionToken } = req.body;
    if (!sessionToken) {
      return res.status(400).json({ ok: false, error: 'sessionToken is required.' });
    }

    if (!process.env.MONDAY_SIGNING_SECRET) {
      return res.status(500).json({ ok: false, error: 'MONDAY_SIGNING_SECRET is not configured.' });
    }

    // Verify the token was signed by Monday.com using your app's signing secret
    let payload;
    try {
      payload = jwt.verify(sessionToken, process.env.MONDAY_SIGNING_SECRET);
    } catch (err) {
      return res.status(401).json({ ok: false, error: 'Invalid or expired Monday session token.' });
    }

    const mondayUserId = String(payload.dat?.user_id);
    const mondayAccountId = String(payload.dat?.account_id);

    if (!mondayUserId || mondayUserId === 'undefined') {
      return res.status(400).json({ ok: false, error: 'Could not extract user ID from Monday token.' });
    }

    // Find or create the admin user record linked to this Monday.com user
    let { data: user, error: findError } = await supabase
      .from('users')
      .select('id, email, role')
      .eq('monday_user_id', mondayUserId)
      .maybeSingle();

    if (findError) {
      return res.status(500).json({ ok: false, error: findError.message });
    }

    if (!user) {
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert([{ monday_user_id: mondayUserId, monday_account_id: mondayAccountId, role: USER_ROLES.ADMIN }])
        .select('id, email, role')
        .single();

      if (createError) {
        return res.status(500).json({ ok: false, error: createError.message });
      }
      user = newUser;
    }

    const token = generateToken(user);
    return res.json({ ok: true, token, user: { id: user.id, role: user.role } });
  } catch (err) {
    console.error('Unexpected error in POST /auth/monday:', err);
    return res.status(500).json({ ok: false, error: 'Unexpected server error.' });
  }
});

export default router;
