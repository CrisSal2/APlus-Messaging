// src/middleware/auth.js
import jwt from "jsonwebtoken";

export function authRequired(req, res, next) {
  const header = req.headers.authorization;

  // Expect: Authorization: Bearer <token>
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({
      ok: false,
      error: "Missing or invalid Authorization header (expected Bearer token).",
    });
  }

  const token = header.substring("Bearer ".length);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // decoded contains: { id, email, role, iat, exp }
    req.user = decoded;

    next();
  } catch (err) {
    return res.status(401).json({
      ok: false,
      error: "Invalid or expired token.",
    });
  }
}
