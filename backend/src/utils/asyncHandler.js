/**
 * Error wrapper middleware for Express route handlers
 * Automatically catches errors and returns standardized error responses
 * Usage: router.post('/endpoint', asyncHandler(async (req, res) => { ... }))
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      console.error('Unexpected error:', err);
      res.status(500).json({ ok: false, error: 'Unexpected server error.' });
    });
  };
}
