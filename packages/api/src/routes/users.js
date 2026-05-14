import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { existsSync, mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import { dirname, extname, join } from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import db from '../db.js';
import { isAdminUser } from '../lib/admin.js';
import { userUnavailable } from '../lib/moderation.js';

const app = new Hono();
const __dirname = dirname(fileURLToPath(import.meta.url));
const AVATAR_DIR = join(__dirname, '..', '..', 'data', 'media', 'avatars');
const PUBLIC_AVATAR_PATH = '/media/avatars';
const PROFILE_FIELDS = ['display_name', 'bio', 'avatar_url', 'link', 'twitter_handle'];
const JWT_SECRET = process.env.JWT_SECRET || 'annotated-dev-secret-change-in-prod';

if (!existsSync(AVATAR_DIR)) mkdirSync(AVATAR_DIR, { recursive: true });

// Starter accounts for onboarding
app.get('/suggested', (c) => {
  const { limit = '6' } = c.req.query();
  const items = db.prepare(`
    SELECT id, username, display_name, avatar_url, bio, link, twitter_handle, credibility_score
    FROM users
    WHERE deleted_at IS NULL AND COALESCE(blocked, 0) = 0
    ORDER BY credibility_score DESC, created_at ASC
    LIMIT ?
  `).all(Math.min(Math.max(Number(limit) || 6, 1), 12));
  return c.json({ items });
});

// Search by handle or display name
app.get('/search', (c) => {
  const query = String(c.req.query('q') || '').trim().replace(/^@/, '');
  const viewerId = c.req.query('viewer_id');
  if (query.length < 2) return c.json({ items: [] });

  const term = `%${query.toLowerCase()}%`;
  const items = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar_url, u.bio, u.link, u.twitter_handle, u.credibility_score,
      CASE WHEN f.follower_id IS NOT NULL THEN 1 ELSE 0 END AS following
    FROM users u
    LEFT JOIN follows f ON f.following_id = u.id AND f.follower_id = ?
    WHERE u.deleted_at IS NULL
      AND COALESCE(u.blocked, 0) = 0
      AND (lower(u.username) LIKE ?
       OR lower(COALESCE(u.display_name, '')) LIKE ?
      )
    ORDER BY
      CASE
        WHEN lower(u.username) = lower(?) THEN 0
        WHEN lower(COALESCE(u.display_name, '')) = lower(?) THEN 1
        WHEN lower(u.username) LIKE lower(?) THEN 2
        ELSE 3
      END,
      u.credibility_score DESC,
      u.username ASC
    LIMIT 8
  `).all(viewerId || '', term, term, query, query, `${query}%`);

  return c.json({ items });
});

// Upload avatar image and optionally attach it to a user profile
app.post('/avatar', async (c) => {
  const body = await c.req.parseBody();
  const file = body.avatar || body.file;
  if (!file || typeof file.arrayBuffer !== 'function') {
    return c.json({ error: 'avatar file required' }, 400);
  }

  if (file.type && !String(file.type).startsWith('image/')) {
    return c.json({ error: 'avatar must be an image' }, 400);
  }

  const extension = safeImageExtension(file.name, file.type);
  const filename = `${nanoid(12)}${extension}`;
  const localPath = join(AVATAR_DIR, filename);
  await writeFile(localPath, Buffer.from(await file.arrayBuffer()));

  const avatarUrl = `${new URL(c.req.url).origin}${PUBLIC_AVATAR_PATH}/${filename}`;
  const userId = typeof body.user_id === 'string' ? body.user_id : '';
  const user = userId ? findUser(userId) : null;
  if (user) {
    db.prepare('UPDATE users SET avatar_url = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(avatarUrl, user.id);
  }

  return c.json({ avatar_url: avatarUrl, user_id: user?.id || null });
});

// Current user profile for frontend route guards
app.get('/me', (c) => {
  const user = authUser(c);
  if (!user) return c.json({ error: 'Not authenticated' }, 401);
  if (userUnavailable(user)) return c.json({ error: 'Account unavailable' }, 403);
  return c.json(publicUser(user));
});

// Username availability check for onboarding
app.post('/username/check', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const normalized = normalizeUsername(c.req.query('username') || body.username || '');
  if (normalized.error) {
    return c.json({ available: false, message: normalized.error, suggestion: suggestUsername(normalized.base || 'user') });
  }

  const taken = usernameTaken(normalized.username);
  return c.json({
    available: !taken,
    suggestion: taken ? suggestUsername(normalized.username) : undefined,
  });
});

// Complete OAuth onboarding profile setup
app.post('/onboard', async (c) => {
  const user = authUser(c);
  if (!user) return c.json({ error: 'Not authenticated' }, 401);
  if (userUnavailable(user)) return c.json({ error: 'Account unavailable' }, 403);

  const body = await c.req.json().catch(() => ({}));
  const displayName = String(body.display_name || '').trim();
  if (!displayName) return c.json({ error: 'display_name is required' }, 400);

  const normalized = normalizeUsername(body.username || user.username);
  if (normalized.error) {
    return c.json({ error: normalized.error, suggestion: suggestUsername(normalized.base || 'user') }, 400);
  }

  const existing = db.prepare('SELECT id FROM users WHERE lower(username) = lower(?) AND id != ?').get(normalized.username, user.id);
  if (existing) {
    return c.json({ error: 'Username taken', suggestion: suggestUsername(normalized.username) }, 409);
  }

  if (body.age === '' || body.age == null) return c.json({ error: 'age is required' }, 400);
  const age = Number(body.age);
  if (!Number.isInteger(age) || age < 13 || age > 120) {
    return c.json({ error: 'age must be between 13 and 120' }, 400);
  }

  const avatarUrl = String(body.avatar_url || '').trim();
  if (avatarUrl && !validUrl(avatarUrl)) return c.json({ error: 'avatar_url must be a valid URL' }, 400);

  db.prepare(`
    UPDATE users
    SET display_name = ?,
        age = ?,
        avatar_url = COALESCE(?, avatar_url),
        username = ?,
        onboarding_completed = 1,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(displayName, age, avatarUrl || null, normalized.username, user.id);

  return c.json(publicUser(findUser(user.id)));
});

// Get user profile
app.get('/:id', (c) => {
  const { id } = c.req.param();
  const viewerId = c.req.query('viewer_id');
  const user = findUser(id);
  if (!user || user.deleted_at) return c.json({ error: 'User not found' }, 404);
  const viewer = viewerId ? findUser(viewerId) : null;
  const viewingSelf = viewer?.id === user.id;

  const stats = {
    annotations: db.prepare("SELECT COUNT(*) as count FROM annotations WHERE user_id = ? AND status = 'published'").get(user.id).count,
    drafts: viewingSelf ? db.prepare("SELECT COUNT(*) as count FROM annotations WHERE user_id = ? AND status = 'draft'").get(user.id).count : undefined,
    removed: viewingSelf ? db.prepare("SELECT COUNT(*) as count FROM annotations WHERE user_id = ? AND status = 'removed'").get(user.id).count : undefined,
    followers: db.prepare('SELECT COUNT(*) as count FROM follows WHERE following_id = ?').get(user.id).count,
    following: db.prepare('SELECT COUNT(*) as count FROM follows WHERE follower_id = ?').get(user.id).count,
    credibility: user.credibility_score || calculateCredibility(user.id),
  };
  const following = viewer && viewer.id !== user.id
    ? Boolean(db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?').get(viewer.id, user.id))
    : false;

  const { provider_id, email, ...safe } = user;
  return c.json({ ...safe, following, stats });
});

// Create/upsert user (called by OAuth flow)
app.post('/', async (c) => {
  const body = await c.req.json();
  const { username, display_name, avatar_url, bio, link, twitter_handle, provider, provider_id, email } = body;

  if (!username || !provider || !provider_id) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  const normalized = normalizeProfile({
    display_name,
    bio,
    avatar_url,
    link,
    twitter_handle,
  }, { displayNameRequired: false });
  if (normalized.error) return c.json({ error: normalized.error }, 400);

  // Check if user exists by provider
  const existing = db.prepare('SELECT * FROM users WHERE provider = ? AND provider_id = ?')
    .get(provider, provider_id);

  if (existing) {
    if (userUnavailable(existing)) return c.json({ error: 'Account unavailable' }, 403);
    db.prepare(`
      UPDATE users
      SET display_name = COALESCE(?, display_name),
          avatar_url = COALESCE(?, avatar_url),
          bio = COALESCE(?, bio),
          link = COALESCE(?, link),
          twitter_handle = COALESCE(?, twitter_handle),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      normalized.profile.display_name,
      normalized.profile.avatar_url,
      normalized.profile.bio,
      normalized.profile.link,
      normalized.profile.twitter_handle,
      existing.id,
    );
    const updated = findUser(existing.id);
    return c.json({ id: existing.id, onboarding_completed: Number(updated?.onboarding_completed || 0), created: false });
  }

  const id = nanoid(12);
  const normalizedUsername = normalizeUsername(username);
  const finalUsername = normalizedUsername.error
    ? suggestUsername(username || display_name || 'user')
    : (usernameTaken(normalizedUsername.username) ? suggestUsername(normalizedUsername.username) : normalizedUsername.username);
  db.prepare(`
    INSERT INTO users (id, username, display_name, avatar_url, bio, link, twitter_handle, provider, provider_id, email, onboarding_completed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(
    id,
    finalUsername,
    normalized.profile.display_name || null,
    normalized.profile.avatar_url || null,
    normalized.profile.bio || null,
    normalized.profile.link || null,
    normalized.profile.twitter_handle || null,
    provider,
    provider_id,
    email || null,
  );

  return c.json({ id, username: finalUsername, onboarding_completed: 0, created: true }, 201);
});

// Update profile fields
app.put('/:id', async (c) => {
  const { id } = c.req.param();
  const user = findUser(id);
  if (!user) return c.json({ error: 'User not found' }, 404);
  if (userUnavailable(user)) return c.json({ error: 'Account unavailable' }, 403);

  const body = await c.req.json();
  const normalized = normalizeProfile(body, { displayNameRequired: true });
  if (normalized.error) return c.json({ error: normalized.error }, 400);

  const updates = [];
  const params = [];
  for (const field of PROFILE_FIELDS) {
    if (Object.hasOwn(normalized.profile, field)) {
      updates.push(`${field} = ?`);
      params.push(normalized.profile[field] || null);
    }
  }

  if (!updates.length) return c.json({ error: 'No profile fields provided' }, 400);
  updates.push("updated_at = datetime('now')");
  params.push(user.id);

  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  const updated = findUser(user.id);
  const { provider_id, email, ...safe } = updated;
  return c.json(safe);
});

// Follow / unfollow
app.post('/:id/follow', async (c) => {
  const { id: following_id } = c.req.param();
  const { user_id } = await c.req.json();

  if (user_id === following_id) return c.json({ error: "Can't follow yourself" }, 400);
  const follower = findUser(user_id);
  const followed = findUser(following_id);
  if (userUnavailable(follower) || userUnavailable(followed)) return c.json({ error: 'Account unavailable' }, 403);

  const existing = db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?')
    .get(user_id, following_id);

  if (existing) {
    db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?')
      .run(user_id, following_id);
    return c.json({ following: false });
  } else {
    db.prepare('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)')
      .run(user_id, following_id);
    return c.json({ following: true });
  }
});

// Get user's annotations
app.get('/:id/annotations', (c) => {
  const { id } = c.req.param();
  const { limit = '20', offset = '0', status = 'published', viewer_id, liked } = c.req.query();
  const user = findUser(id);
  if (!user || user.deleted_at) return c.json({ error: 'User not found' }, 404);

  const viewer = viewer_id ? findUser(viewer_id) : null;
  const isSelf = viewer?.id === user.id;
  const requestedStatus = String(status || 'published').toLowerCase();
  const effectiveStatus = isSelf && ['draft', 'published', 'removed'].includes(requestedStatus)
    ? requestedStatus
    : 'published';

  if (liked === '1') {
    const items = db.prepare(`
      SELECT a.*, u.username, u.display_name, u.avatar_url 
      FROM likes l
      JOIN annotations a ON a.id = l.annotation_id
      JOIN users u ON a.user_id = u.id
      WHERE l.user_id = ?
        AND a.is_public = 1
        AND a.status = 'published'
        AND u.deleted_at IS NULL
        AND COALESCE(u.blocked, 0) = 0
      ORDER BY l.created_at DESC LIMIT ? OFFSET ?
    `).all(user.id, Number(limit), Number(offset));

    return c.json({ items, status: 'published', liked: true });
  }

  let sql = `
    SELECT a.*, u.username, u.display_name, u.avatar_url 
    FROM annotations a JOIN users u ON a.user_id = u.id
    WHERE a.user_id = ? AND a.status = ?
  `;
  const params = [user.id, effectiveStatus];

  if (effectiveStatus === 'published') {
    sql += ' AND a.is_public = 1';
  }

  sql += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const items = db.prepare(sql).all(...params);
  return c.json({ items, status: effectiveStatus });
});

export default app;

function findUser(idOrUsername) {
  let user = db.prepare('SELECT * FROM users WHERE id = ?').get(idOrUsername);
  if (!user) user = db.prepare('SELECT * FROM users WHERE lower(username) = lower(?)').get(idOrUsername);
  return user || null;
}

function authUser(c) {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET);
    return findUser(payload.sub);
  } catch {
    return null;
  }
}

function publicUser(user) {
  if (!user) return null;
  const { provider_id, email, ...safe } = user;
  return {
    ...safe,
    age: safe.age == null ? null : Number(safe.age),
    onboarding_completed: Boolean(safe.onboarding_completed),
    is_admin: isAdminUser(user),
  };
}

function normalizeUsername(value) {
  const username = String(value || '').trim().toLowerCase();
  const base = username.replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  if (username.length < 3 || username.length > 20) {
    return { error: 'username must be 3-20 characters', base };
  }
  if (!/^[a-z0-9_]+$/.test(username)) {
    return { error: 'username may only use letters, numbers, and underscores', base };
  }
  if (username.startsWith('_') || username.endsWith('_')) {
    return { error: 'username cannot start or end with an underscore', base };
  }
  if (username.includes('__')) {
    return { error: 'username cannot contain consecutive underscores', base };
  }
  return { username };
}

function usernameTaken(username) {
  return Boolean(db.prepare('SELECT 1 FROM users WHERE lower(username) = lower(?)').get(username));
}

function suggestUsername(value) {
  const normalized = String(value || 'user')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 18) || 'user';
  const base = normalized.length >= 3 ? normalized : `${normalized}user`.slice(0, 18);
  for (let index = 1; index < 1000; index += 1) {
    const suffix = `_${index}`;
    const candidate = `${base.slice(0, 20 - suffix.length)}${suffix}`;
    if (!usernameTaken(candidate)) return candidate;
  }
  return `${base}_${nanoid(4).toLowerCase()}`;
}

function normalizeProfile(body, { displayNameRequired }) {
  const profile = {};

  if (Object.hasOwn(body, 'display_name')) {
    const displayName = String(body.display_name || '').trim();
    if (displayNameRequired && !displayName) return { error: 'display_name is required' };
    profile.display_name = displayName || null;
  } else if (displayNameRequired) {
    return { error: 'display_name is required' };
  }

  if (Object.hasOwn(body, 'bio')) {
    const bio = String(body.bio || '').trim();
    if (bio.length > 280) return { error: 'bio must be 280 characters or fewer' };
    profile.bio = bio || null;
  }

  for (const field of ['avatar_url', 'link']) {
    if (!Object.hasOwn(body, field)) continue;
    const value = String(body[field] || '').trim();
    if (value && !validUrl(value)) return { error: `${field} must be a valid URL` };
    profile[field] = value || null;
  }

  if (Object.hasOwn(body, 'twitter_handle')) {
    const handle = String(body.twitter_handle || '').trim().replace(/^@+/, '');
    if (handle && !/^[A-Za-z0-9_]{1,15}$/.test(handle)) {
      return { error: 'twitter_handle must be 1-15 letters, numbers, or underscores' };
    }
    profile.twitter_handle = handle || null;
  }

  return { profile };
}

function validUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

function safeImageExtension(name = '', mimeType = '') {
  const extension = extname(name).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif'].includes(extension)) return extension;
  if (mimeType.includes('png')) return '.png';
  if (mimeType.includes('gif')) return '.gif';
  if (mimeType.includes('webp')) return '.webp';
  if (mimeType.includes('avif')) return '.avif';
  return '.jpg';
}

function calculateCredibility(userId) {
  const stats = db.prepare(`
    SELECT
      COUNT(*) AS annotations,
      COALESCE(SUM(noteworthy_count), 0) AS noteworthy,
      COALESCE(SUM(like_count), 0) AS credible,
      COALESCE(SUM(CASE WHEN annotation_type = 'Fact Check' THEN 1 ELSE 0 END), 0) AS fact_checks
    FROM annotations
    WHERE user_id = ? AND status = 'published'
  `).get(userId);
  return Number(stats.credible || 0)
    + Number(stats.noteworthy || 0)
    + Number(stats.fact_checks || 0) * 3
    + Number(stats.annotations || 0);
}
