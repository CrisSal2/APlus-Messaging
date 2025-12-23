// src/authRoutes.js
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from './supabaseClient.js';

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
  const { email, password } = req.body;

  // Basic validation
  if (!email || !password) {
    return res.status(400).json({ ok: false, error: 'Email and password required.' });
  }

  // Check if user already exists
  const existing = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .maybeSingle();

  if (existing.data) {
    return res.status(400).json({ ok: false, error: 'User already exists.' });
  }

  // Hash the password
  const password_hash = await bcrypt.hash(password, 10);

  // Create user
  const { data, error } = await supabase
    .from('users')
    .insert([
      { email, password_hash, role: 'client' }
    ])
    .select('*')
    .single();

  if (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: error.message });
  }

  const token = generateToken(data);

  return res.json({ ok: true, user: data, token });
});

// -----------------------------
// Client Login
// -----------------------------
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ ok: false, error: 'Email and password required.' });
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .eq('role', 'client')
    .single();

  if (error || !user) {
    return res.status(400).json({ ok: false, error: 'Invalid credentials.' });
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    return res.status(400).json({ ok: false, error: 'Invalid credentials.' });
  }

  const token = generateToken(user);

  return res.json({ ok: true, user, token });
});

export default router;
