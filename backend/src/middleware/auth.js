// src/middleware/auth.js
import jwt from 'jsonwebtoken';

export function authRequired(req, res, next) {
  const header = req.headers.authorization;

  // Expect: Authorization: Bearer <token>
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({
      ok: false,
      error: 'Missing or invalid Authorization header (expected Bearer token).',
    });
  }

  const token = header.substring('Bearer '.length);

  try {
    // decoded contains: { id, email, role, acc, iat, exp }
    req.user = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    next();
  } catch {
    return res.status(401).json({ ok: false, error: 'Invalid or expired token.' });
  }
}
