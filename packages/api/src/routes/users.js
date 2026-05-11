import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import db from '../db.js';

const app = new Hono();

// Starter accounts for onboarding
app.get('/suggested', (c) => {
  const { limit = '6' } = c.req.query();
  const items = db.prepare(`
    SELECT id, username, display_name, avatar_url, bio, credibility_score
    FROM users
    ORDER BY credibility_score DESC, created_at ASC
    LIMIT ?
  `).all(Math.min(Math.max(Number(limit) || 6, 1), 12));
  return c.json({ items });
});

// Get user profile
app.get('/:id', (c) => {
  const { id } = c.req.param();
  
  // Try by id first, then by username
  let user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) user = db.prepare('SELECT * FROM users WHERE username = ?').get(id);
  if (!user) return c.json({ error: 'User not found' }, 404);

  const stats = {
    annotations: db.prepare('SELECT COUNT(*) as count FROM annotations WHERE user_id = ?').get(user.id).count,
    followers: db.prepare('SELECT COUNT(*) as count FROM follows WHERE following_id = ?').get(user.id).count,
    following: db.prepare('SELECT COUNT(*) as count FROM follows WHERE follower_id = ?').get(user.id).count,
    credibility: user.credibility_score || calculateCredibility(user.id),
  };

  const { provider_id, email, ...safe } = user;
  return c.json({ ...safe, stats });
});

// Create/upsert user (called by OAuth flow)
app.post('/', async (c) => {
  const body = await c.req.json();
  const { username, display_name, avatar_url, bio, provider, provider_id, email } = body;

  if (!username || !provider || !provider_id) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  // Check if user exists by provider
  const existing = db.prepare('SELECT id FROM users WHERE provider = ? AND provider_id = ?')
    .get(provider, provider_id);

  if (existing) {
    db.prepare(`UPDATE users SET display_name = ?, avatar_url = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(display_name || null, avatar_url || null, existing.id);
    return c.json({ id: existing.id, created: false });
  }

  const id = nanoid(12);
  db.prepare(`
    INSERT INTO users (id, username, display_name, avatar_url, bio, provider, provider_id, email)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, username, display_name || null, avatar_url || null, bio || null, provider, provider_id, email || null);

  return c.json({ id, created: true }, 201);
});

// Follow / unfollow
app.post('/:id/follow', async (c) => {
  const { id: following_id } = c.req.param();
  const { user_id } = await c.req.json();

  if (user_id === following_id) return c.json({ error: "Can't follow yourself" }, 400);

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
  const { limit = '20', offset = '0' } = c.req.query();

  const items = db.prepare(`
    SELECT a.*, u.username, u.display_name, u.avatar_url 
    FROM annotations a JOIN users u ON a.user_id = u.id
    WHERE a.user_id = ? AND a.is_public = 1
    ORDER BY a.created_at DESC LIMIT ? OFFSET ?
  `).all(id, Number(limit), Number(offset));

  return c.json({ items });
});

export default app;

function calculateCredibility(userId) {
  const stats = db.prepare(`
    SELECT
      COUNT(*) AS annotations,
      COALESCE(SUM(noteworthy_count), 0) AS noteworthy,
      COALESCE(SUM(CASE WHEN annotation_type = 'Fact Check' THEN 1 ELSE 0 END), 0) AS fact_checks
    FROM annotations
    WHERE user_id = ?
  `).get(userId);
  return Number(stats.noteworthy || 0) * 5
    + Number(stats.fact_checks || 0) * 3
    + Number(stats.annotations || 0);
}
