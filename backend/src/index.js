import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import authRoutes from './authRoutes.js';
import inviteRoutes from './inviteRoutes.js';
import boardRoutes from './boardRoutes.js';
import messageRoutes from './messageRoutes.js';

const isProd = process.env.NODE_ENV === 'production';

// ---- Startup config checks ----
const { JWT_SECRET, MONDAY_SIGNING_SECRET } = process.env;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('❌ JWT_SECRET must be set and at least 32 characters long.');
  process.exit(1);
}
if (MONDAY_SIGNING_SECRET && MONDAY_SIGNING_SECRET === JWT_SECRET) {
  console.error('❌ MONDAY_SIGNING_SECRET must differ from JWT_SECRET.');
  process.exit(1);
}

const corsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
if (isProd && corsOrigins.length === 0) {
  console.error('❌ CORS_ORIGINS must be set (comma-separated) in production.');
  process.exit(1);
}

const app = express();

// Set TRUST_PROXY=1 when behind a reverse proxy so rate limiting sees real IPs
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
}

app.use(helmet());
app.use(cors(corsOrigins.length ? { origin: corsOrigins } : undefined));
app.use(express.json({ limit: '16kb' }));
// Express 5 leaves req.body undefined for non-JSON requests
app.use((req, res, next) => {
  req.body ??= {};
  next();
});

app.use('/auth', authRoutes);
app.use('/api/invites', inviteRoutes);
app.use('/api/boards', boardRoutes);
app.use('/api/messages', messageRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'APlus Messaging backend is running' });
});

app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Route not found' });
});

// Global error handler. Express 5 forwards async errors here automatically.
// Never leak internal (e.g. database) error text to clients.
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ ok: false, error: 'Request body too large.' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, error: 'Malformed JSON body.' });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ ok: false, error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`APlus Messaging backend listening on http://localhost:${PORT}`);
});
