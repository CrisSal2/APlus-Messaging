const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

export const normalizeEmail = (v) =>
  typeof v === 'string' ? v.trim().toLowerCase() : '';

export const isValidEmail = (v) =>
  typeof v === 'string' && v.length <= 254 && EMAIL_RE.test(v);

export const PASSWORD_MIN = 10;
// bcrypt silently truncates beyond 72 bytes
export const PASSWORD_MAX_BYTES = 72;

export function passwordProblem(pw) {
  if (typeof pw !== 'string') return 'Password must be a string.';
  if (pw.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters.`;
  if (Buffer.byteLength(pw, 'utf8') > PASSWORD_MAX_BYTES) {
    return `Password must be at most ${PASSWORD_MAX_BYTES} bytes.`;
  }
  return null;
}

export const PG_UNIQUE_VIOLATION = '23505';
