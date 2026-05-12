import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import db from '../db.js';

const app = new Hono();
const ANNOTATION_TYPES = new Set(['Opinion', 'Analysis', 'Fact Check', 'Context', 'Correction', 'Breaking']);

// List annotations (with optional filters)
app.get('/', (c) => {
  const { user_id, source_type, annotation_type, limit = '20', offset = '0' } = c.req.query();
  
  let sql = 'SELECT a.*, u.username, u.display_name, u.avatar_url FROM annotations a JOIN users u ON a.user_id = u.id WHERE a.is_public = 1';
  const params = [];

  if (user_id) {
    sql += ' AND a.user_id = ?';
    params.push(user_id);
  }
  if (source_type) {
    sql += ' AND a.source_type = ?';
    params.push(source_type);
  }
  if (annotation_type) {
    sql += ' AND a.annotation_type = ?';
    params.push(annotation_type);
  }

  sql += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const items = db.prepare(sql).all(...params);
  const total = db.prepare('SELECT COUNT(*) as count FROM annotations WHERE is_public = 1').get();

  return c.json({ items, total: total.count });
});

// Claims filed against a single annotation
app.get('/:id/claims', (c) => {
  const { id } = c.req.param();
  const claims = db.prepare(`
    SELECT id, annotation_id, claimant_email, reason, status, created_at
    FROM claims
    WHERE annotation_id = ?
    ORDER BY created_at DESC
  `).all(id);

  return c.json({ count: claims.length, claims });
});

// Get single annotation
app.get('/:id', (c) => {
  const { id } = c.req.param();
  const annotation = db.prepare(`
    SELECT a.*, u.username, u.display_name, u.avatar_url 
    FROM annotations a JOIN users u ON a.user_id = u.id 
    WHERE a.id = ?
  `).get(id);
  
  if (!annotation) return c.json({ error: 'Not found' }, 404);

  // Threaded comments
  const flat = db.prepare(`
    SELECT c.*, u.username, u.display_name, u.avatar_url 
    FROM comments c JOIN users u ON c.user_id = u.id 
    WHERE c.annotation_id = ? ORDER BY c.created_at ASC
  `).all(id);
  const byId = {};
  const roots = [];
  for (const c of flat) { c.replies = []; byId[c.id] = c; }
  for (const c of flat) {
    if (c.parent_id && byId[c.parent_id]) byId[c.parent_id].replies.push(c);
    else roots.push(c);
  }

  // Who liked this (recent 5)
  const recentLikes = db.prepare(`
    SELECT u.username, u.display_name, u.avatar_url 
    FROM likes l JOIN users u ON l.user_id = u.id 
    WHERE l.annotation_id = ? ORDER BY l.created_at DESC LIMIT 5
  `).all(id);

  return c.json({ ...annotation, comments: roots, recent_likes: recentLikes });
});

// Resolve user_id — accepts nanoid or username, returns the nanoid id
function resolveUserId(raw) {
  if (!raw) return null;
  // Try direct id lookup first
  const byId = db.prepare('SELECT id FROM users WHERE id = ?').get(raw);
  if (byId) return byId.id;
  // Fall back to username lookup
  const byName = db.prepare('SELECT id FROM users WHERE username = ?').get(raw);
  if (byName) return byName.id;
  // Extension fallback users are posted as provider_id values.
  const byProvider = db.prepare('SELECT id FROM users WHERE provider_id = ?').get(raw);
  return byProvider ? byProvider.id : null;
}

// Create annotation
app.post('/', async (c) => {
  const body = await c.req.json();
  const { user_id: rawUserId, source_url, source_title, source_type, source_domain, source_thumbnail,
          source_site_name, source_author, source_published_at, clip_text, clip_start_sec, clip_end_sec,
          clip_media_path, commentary, annotation_type } = body;

  if (!rawUserId || !source_url || !source_type || !commentary) {
    return c.json({ error: 'Missing required fields: user_id, source_url, source_type, commentary' }, 400);
  }

  const user_id = resolveUserId(rawUserId);
  if (!user_id) {
    return c.json({ error: `User not found: ${rawUserId}` }, 404);
  }

  const id = nanoid(12);
  const safeAnnotationType = ANNOTATION_TYPES.has(annotation_type) ? annotation_type : 'Opinion';
  db.prepare(`
    INSERT INTO annotations (id, user_id, source_url, source_title, source_type, source_domain, source_site_name,
      source_author, source_published_at, source_thumbnail, clip_text, clip_start_sec, clip_end_sec,
      clip_media_path, commentary, annotation_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, user_id, source_url, source_title, source_type, source_domain, source_site_name || null,
    source_author || null, source_published_at || null, source_thumbnail || null, clip_text || null,
    clip_start_sec || null, clip_end_sec || null, clip_media_path || null, commentary, safeAnnotationType);

  return c.json({ id, user_id, created: true }, 201);
});

// Update annotation
app.patch('/:id', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const allowed = ['commentary', 'is_public', 'annotation_type'];
  const updates = [];
  const params = [];

  for (const key of allowed) {
    if (body[key] !== undefined) {
      if (key === 'annotation_type' && !ANNOTATION_TYPES.has(body[key])) continue;
      updates.push(`${key} = ?`);
      params.push(body[key]);
    }
  }

  if (!updates.length) return c.json({ error: 'Nothing to update' }, 400);

  updates.push("updated_at = datetime('now')");
  params.push(id);

  db.prepare(`UPDATE annotations SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  return c.json({ updated: true });
});

// Noteworthy/unnoteworthy
app.post('/:id/noteworthy', async (c) => {
  const { id: annotation_id } = c.req.param();
  const { user_id: rawUserId } = await c.req.json();
  const user_id = resolveUserId(rawUserId) || rawUserId;
  if (!user_id) return c.json({ error: 'Missing user_id' }, 400);

  const existing = db.prepare('SELECT 1 FROM noteworthy WHERE user_id = ? AND annotation_id = ?')
    .get(user_id, annotation_id);

  if (existing) {
    db.prepare('DELETE FROM noteworthy WHERE user_id = ? AND annotation_id = ?')
      .run(user_id, annotation_id);
    db.prepare('UPDATE annotations SET noteworthy_count = MAX(0, noteworthy_count - 1) WHERE id = ?')
      .run(annotation_id);
    recalculateCredibility(annotation_id);
    return c.json({ noteworthy: false });
  }

  db.prepare('INSERT INTO noteworthy (user_id, annotation_id) VALUES (?, ?)')
    .run(user_id, annotation_id);
  db.prepare('UPDATE annotations SET noteworthy_count = noteworthy_count + 1 WHERE id = ?')
    .run(annotation_id);
  recalculateCredibility(annotation_id);
  return c.json({ noteworthy: true });
});

// Delete annotation
app.delete('/:id', (c) => {
  const { id } = c.req.param();
  db.prepare('DELETE FROM annotations WHERE id = ?').run(id);
  return c.json({ deleted: true });
});

// Add comment (supports nested replies via parent_id)
app.post('/:id/comments', async (c) => {
  const { id: annotation_id } = c.req.param();
  const { user_id: rawUserId, body: commentBody, parent_id } = await c.req.json();

  if (!rawUserId || !commentBody) return c.json({ error: 'Missing user_id or body' }, 400);
  const user_id = resolveUserId(rawUserId);
  if (!user_id) return c.json({ error: `User not found: ${rawUserId}` }, 404);

  // Validate parent exists if provided
  if (parent_id) {
    const parent = db.prepare('SELECT id FROM comments WHERE id = ? AND annotation_id = ?')
      .get(parent_id, annotation_id);
    if (!parent) return c.json({ error: 'Parent comment not found' }, 404);
  }

  const id = nanoid(12);
  db.prepare('INSERT INTO comments (id, annotation_id, user_id, body, parent_id) VALUES (?, ?, ?, ?, ?)')
    .run(id, annotation_id, user_id, commentBody, parent_id || null);
  
  db.prepare('UPDATE annotations SET comment_count = comment_count + 1 WHERE id = ?')
    .run(annotation_id);

  return c.json({ id, created: true }, 201);
});

// Get comments as a threaded tree
app.get('/:id/comments', (c) => {
  const { id: annotation_id } = c.req.param();
  const flat = db.prepare(`
    SELECT c.*, u.username, u.display_name, u.avatar_url 
    FROM comments c JOIN users u ON c.user_id = u.id 
    WHERE c.annotation_id = ? ORDER BY c.created_at ASC
  `).all(annotation_id);

  // Build tree
  const byId = {};
  const roots = [];
  for (const c of flat) {
    c.replies = [];
    byId[c.id] = c;
  }
  for (const c of flat) {
    if (c.parent_id && byId[c.parent_id]) {
      byId[c.parent_id].replies.push(c);
    } else {
      roots.push(c);
    }
  }
  return c.json({ comments: roots, total: flat.length });
});

// Like/unlike
app.post('/:id/like', async (c) => {
  const { id: annotation_id } = c.req.param();
  const { user_id: rawUserId } = await c.req.json();
  const user_id = resolveUserId(rawUserId) || rawUserId;

  const existing = db.prepare('SELECT 1 FROM likes WHERE user_id = ? AND annotation_id = ?')
    .get(user_id, annotation_id);

  if (existing) {
    db.prepare('DELETE FROM likes WHERE user_id = ? AND annotation_id = ?')
      .run(user_id, annotation_id);
    db.prepare('UPDATE annotations SET like_count = MAX(0, like_count - 1) WHERE id = ?')
      .run(annotation_id);
    return c.json({ liked: false });
  } else {
    db.prepare('INSERT INTO likes (user_id, annotation_id) VALUES (?, ?)')
      .run(user_id, annotation_id);
    db.prepare('UPDATE annotations SET like_count = like_count + 1 WHERE id = ?')
      .run(annotation_id);
    return c.json({ liked: true });
  }
});

// Pin/unpin
app.post('/:id/pin', async (c) => {
  const { id: annotation_id } = c.req.param();
  const { user_id: rawUserId } = await c.req.json();
  const user_id = resolveUserId(rawUserId) || rawUserId;

  const existing = db.prepare('SELECT 1 FROM pins WHERE user_id = ? AND annotation_id = ?')
    .get(user_id, annotation_id);

  if (existing) {
    db.prepare('DELETE FROM pins WHERE user_id = ? AND annotation_id = ?')
      .run(user_id, annotation_id);
    db.prepare('UPDATE annotations SET pin_count = MAX(0, pin_count - 1) WHERE id = ?')
      .run(annotation_id);
    return c.json({ pinned: false });
  } else {
    db.prepare('INSERT INTO pins (user_id, annotation_id) VALUES (?, ?)')
      .run(user_id, annotation_id);
    db.prepare('UPDATE annotations SET pin_count = pin_count + 1 WHERE id = ?')
      .run(annotation_id);
    return c.json({ pinned: true });
  }
});

function recalculateCredibility(annotation_id) {
  const row = db.prepare('SELECT user_id FROM annotations WHERE id = ?').get(annotation_id);
  if (!row?.user_id) return;
  const stats = db.prepare(`
    SELECT
      COUNT(*) AS annotations,
      COALESCE(SUM(noteworthy_count), 0) AS noteworthy,
      COALESCE(SUM(CASE WHEN annotation_type = 'Fact Check' THEN 1 ELSE 0 END), 0) AS fact_checks
    FROM annotations
    WHERE user_id = ?
  `).get(row.user_id);
  const score = Number(stats.noteworthy || 0) * 5
    + Number(stats.fact_checks || 0) * 3
    + Number(stats.annotations || 0);
  db.prepare('UPDATE users SET credibility_score = ? WHERE id = ?').run(score, row.user_id);
}

export default app;
