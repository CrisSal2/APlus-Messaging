// backend/src/middleware/adminRequired.js
export function adminRequired(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Admins only.' });
  }
  next();
}
