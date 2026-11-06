// src/middleware/adminRequired.js
import { USER_ROLES } from '../constants/roles.js';

export function adminRequired(req, res, next) {
  if (req.user?.role !== USER_ROLES.ADMIN) {
    return res.status(403).json({ ok: false, error: 'Admins only.' });
  }
  next();
}
