import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serveStatic } from '@hono/node-server/serve-static';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = process.env.DATA_DIR || join(__dirname, '..', 'data');
const WEB_ROOT = join(__dirname, '..', 'public');
import annotations from './routes/annotations.js';
import feed from './routes/feed.js';
import users from './routes/users.js';
import claims from './routes/claims.js';
import clip from './routes/clip.js';
import auth from './routes/auth.js';

const app = new Hono();

// Middleware
app.use('*', cors({ origin: '*' }));
app.use('*', logger());

// Health
app.get('/api/health', (c) => c.json({ status: 'ok', version: '0.1.0' }));

// Routes
app.route('/api/auth', auth);
app.route('/api/annotations', annotations);
app.route('/api/feed', feed);
app.route('/api/users', users);
app.route('/api/claims', claims);
app.route('/api/clip', clip);

// Serve clip media files — resolve from package root, not cwd
app.use('/media/*', serveStatic({ root: DATA_ROOT }));
app.all('/media/*', (c) => c.json({ error: 'Media not found' }, 404));

// Serve built web app when deployed as a single Fly service.
app.use('*', serveStatic({ root: WEB_ROOT }));
app.get('*', serveStatic({ path: 'index.html', root: WEB_ROOT }));

const PORT = Number(process.env.PORT) || 3080;

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`✦ Annotated API running on http://localhost:${info.port}`);
});
