// src/authRoutes.js
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { supabase } from './supabaseClient.js';
import { USER_ROLES, BOARD_ROLES } from './constants/roles.js';
import {
  normalizeEmail,
  isValidEmail,
  passwordProblem,
  PG_UNIQUE_VIOLATION,
} from './utils/validate.js';

const router = express.Router();

const BCRYPT_COST = 12;
// Compared against when the email is unknown so login timing doesn't reveal it
const DUMMY_HASH = bcrypt.hashSync('timing-equalisation-placeholder', BCRYPT_COST);

const ADMIN_TOKEN_TTL = '1d';
const CLIENT_TOKEN_TTL = '7d';

const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many attempts. Try again later.' },
});

const mondayLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many attempts. Try again later.' },
});

// Generate JWT (used after login or signup).
// `acc` is the Monday.com account id for admins; it scopes all board access.
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      acc: user.monday_account_id ?? null,
    },
    process.env.JWT_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: user.role === USER_ROLES.ADMIN ? ADMIN_TOKEN_TTL : CLIENT_TOKEN_TTL,
    }
  );
}

const publicUser = (u) => ({ id: u.id, email: u.email, role: u.role });

// -----------------------------
// Client Signup (invite only)
// Also lets an EXISTING client accept an invite to another board (or be
// re-invited after being removed) by proving their password.
// -----------------------------
router.post('/signup', credentialLimiter, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { password, token } = req.body;

  if (!isValidEmail(email) || typeof password !== 'string' || typeof token !== 'string' || !token) {
    return res.status(400).json({
      ok: false,
      error: 'Valid email, password, and invite token are required.',
    });
  }

  // 1) Look up the invite. One generic message for every invite problem.
  const INVALID_INVITE = { ok: false, error: 'Invalid or expired invite.' };

  const { data: invite, error: inviteError } = await supabase
    .from('invites')
    .select('id, email, board_id, used_at, expires_at')
    .eq('token', token)
    .maybeSingle();
  if (inviteError) throw inviteError;

  if (
    !invite ||
    invite.used_at ||
    invite.email.toLowerCase() !== email ||
    (invite.expires_at && new Date() > new Date(invite.expires_at))
  ) {
    return res.status(400).json(INVALID_INVITE);
  }

  // 2) Existing user? Must be a client and prove their password.
  const { data: existing, error: existingError } = await supabase
    .from('users')
    .select('id, email, role, password_hash')
    .eq('email', email)
    .maybeSingle();
  if (existingError) throw existingError;

  let user = existing;
  let passwordHash = null;

  if (existing) {
    const ok =
      existing.role === USER_ROLES.CLIENT &&
      existing.password_hash &&
      (await bcrypt.compare(password, existing.password_hash));
    if (!ok) {
      return res.status(401).json({ ok: false, error: 'Invalid credentials.' });
    }
  } else {
    const problem = passwordProblem(password);
    if (problem) return res.status(400).json({ ok: false, error: problem });
    passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  }

  // 3) Atomically claim the invite: only one concurrent request can win.
  const { data: claimed, error: claimError } = await supabase
    .from('invites')
    .update({ used_at: new Date().toISOString() })
    .eq('id', invite.id)
    .is('used_at', null)
    .select('id');
  if (claimError) throw claimError;
  if (!claimed || claimed.length === 0) {
    return res.status(400).json(INVALID_INVITE);
  }

  const releaseInvite = () =>
    supabase.from('invites').update({ used_at: null }).eq('id', invite.id);

  // 4) Create the user (if new) and link to the board; roll back on failure so
  //    the invite can be retried and no half-created account is left behind.
  let createdUserId = null;
  try {
    if (!existing) {
      const { data: newUser, error: userError } = await supabase
        .from('users')
        .insert([{ email, password_hash: passwordHash, role: USER_ROLES.CLIENT }])
        .select('id, email, role')
        .single();

      if (userError) {
        await releaseInvite();
        if (userError.code === PG_UNIQUE_VIOLATION) {
          return res.status(409).json({ ok: false, error: 'Unable to complete signup. Try logging in.' });
        }
        throw userError;
      }
      user = newUser;
      createdUserId = newUser.id;
    }

    const { error: linkError } = await supabase
      .from('board_participants')
      .upsert(
        [{ board_id: invite.board_id, user_id: user.id, role_in_board: BOARD_ROLES.CLIENT }],
        { onConflict: 'board_id,user_id' }
      );
    if (linkError) throw linkError;
  } catch (err) {
    await releaseInvite();
    if (createdUserId) await supabase.from('users').delete().eq('id', createdUserId);
    throw err;
  }

  return res.json({
    ok: true,
    user: publicUser(user),
    token: generateToken(user),
    boardId: invite.board_id,
  });
});

// -----------------------------
// Client Login
// -----------------------------
router.post('/login', credentialLimiter, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { password } = req.body;

  if (!email || typeof password !== 'string' || !password) {
    return res.status(400).json({ ok: false, error: 'Email and password required.' });
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('id, email, role, password_hash')
    .eq('email', email)
    .eq('role', USER_ROLES.CLIENT)
    .maybeSingle();
  if (error) throw error;

  // Always run a bcrypt compare so response time doesn't reveal whether the user exists
  const match = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);
  if (!user || !match) {
    return res.status(401).json({ ok: false, error: 'Invalid credentials.' });
  }

  return res.json({ ok: true, user: publicUser(user), token: generateToken(user) });
});

// -----------------------------
// Monday.com App Login
// Validates a Monday.com sessionToken (JWT signed with the app's signing
// secret) and returns an API JWT scoped to the user's Monday account.
//
// Requires in Supabase: see backend/db/001_hardening.sql
// -----------------------------
router.post('/monday', mondayLimiter, async (req, res) => {
  const { sessionToken } = req.body;
  if (typeof sessionToken !== 'string' || !sessionToken) {
    return res.status(400).json({ ok: false, error: 'sessionToken is required.' });
  }

  if (!process.env.MONDAY_SIGNING_SECRET) {
    console.error('MONDAY_SIGNING_SECRET is not configured.');
    return res.status(500).json({ ok: false, error: 'Server is not configured for Monday login.' });
  }

  let payload;
  try {
    payload = jwt.verify(sessionToken, process.env.MONDAY_SIGNING_SECRET, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ ok: false, error: 'Invalid or expired Monday session token.' });
  }

  const dat = payload.dat ?? {};
  const mondayUserId = dat.user_id != null ? String(dat.user_id) : '';
  const mondayAccountId = dat.account_id != null ? String(dat.account_id) : '';

  if (!mondayUserId || !mondayAccountId) {
    return res.status(400).json({ ok: false, error: 'Monday token is missing user or account id.' });
  }
  // Guests and view-only users must not be able to manage boards or invite clients
  if (dat.is_guest || dat.is_view_only) {
    return res.status(403).json({ ok: false, error: 'Guests and view-only users cannot use this app.' });
  }

  const COLUMNS = 'id, email, role, monday_account_id';
  const findUser = () =>
    supabase.from('users').select(COLUMNS).eq('monday_user_id', mondayUserId).maybeSingle();

  let { data: user, error: findError } = await findUser();
  if (findError) throw findError;

  if (!user) {
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert([
        {
          monday_user_id: mondayUserId,
          monday_account_id: mondayAccountId,
          role: USER_ROLES.ADMIN,
        },
      ])
      .select(COLUMNS)
      .single();

    if (createError) {
      if (createError.code !== PG_UNIQUE_VIOLATION) throw createError;
      // Lost a race with a concurrent first login: read the winner's row
      ({ data: user, error: findError } = await findUser());
      if (findError) throw findError;
    } else {
      user = newUser;
    }
  }

  if (!user || user.role !== USER_ROLES.ADMIN) {
    return res.status(403).json({ ok: false, error: 'Account is not permitted to use this app.' });
  }

  // The signed Monday token is the source of truth for the account
  if (user.monday_account_id !== mondayAccountId) {
    const { error: updateError } = await supabase
      .from('users')
      .update({ monday_account_id: mondayAccountId })
      .eq('id', user.id);
    if (updateError) throw updateError;
    user.monday_account_id = mondayAccountId;
  }

  return res.json({ ok: true, token: generateToken(user), user: { id: user.id, role: user.role } });
});

export default router;
