import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { existsSync, mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import { dirname, extname, join } from 'path';
import { fileURLToPath } from 'url';
import { extractPodcastClip, extractYouTubeClip } from '@annotated/clip-engine';
import db from '../db.js';
import { userUnavailable } from '../lib/moderation.js';

const app = new Hono();
const ANNOTATION_TYPES = new Set(['Opinion', 'Analysis', 'Fact Check', 'Context', 'Correction', 'Breaking']);
const PUBLIC_STATUSES = new Set(['published']);
const WRITABLE_STATUSES = new Set(['draft', 'published']);
const MAX_COMMENTARY_LENGTH = 360;
const __dirname = dirname(fileURLToPath(import.meta.url));
const MEDIA_DIR = join(__dirname, '..', '..', 'data', 'media');
const MAX_MEDIA_CLIP_SECONDS = 90;

if (!existsSync(MEDIA_DIR)) mkdirSync(MEDIA_DIR, { recursive: true });

// List annotations (with optional filters)
app.get('/', (c) => {
  const { user_id, source_type, annotation_type, limit = '20', offset = '0' } = c.req.query();
  
  let sql = "SELECT a.*, u.username, u.display_name, u.avatar_url FROM annotations a JOIN users u ON a.user_id = u.id WHERE a.is_public = 1 AND a.status = 'published' AND u.deleted_at IS NULL AND COALESCE(u.blocked, 0) = 0";
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
  const total = db.prepare(`
    SELECT COUNT(*) as count
    FROM annotations a
    JOIN users u ON a.user_id = u.id
    WHERE a.is_public = 1
      AND a.status = 'published'
      AND u.deleted_at IS NULL
      AND COALESCE(u.blocked, 0) = 0
  `).get();

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
  const viewerId = resolveUserId(c.req.query('viewer_id'));
  const annotation = db.prepare(`
    SELECT a.*, u.username, u.display_name, u.avatar_url 
    FROM annotations a JOIN users u ON a.user_id = u.id 
    WHERE a.id = ?
  `).get(id);
  
  if (!annotation) return c.json({ error: 'Not found' }, 404);
  if (annotation.status !== 'published' && viewerId !== annotation.user_id) {
    return c.json({ error: 'Not found' }, 404);
  }

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

function getUserById(userId) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
}

function isPaidUser(user) {
  const tier = String(user?.subscription_tier || 'free').toLowerCase();
  return tier && !['free', 'starter'].includes(tier);
}

function normalizeRequestedStatus(value, fallback = 'draft') {
  const status = String(value || fallback).toLowerCase();
  return WRITABLE_STATUSES.has(status) ? status : fallback;
}

function visibilityForStatus(status) {
  return PUBLIC_STATUSES.has(status) ? 1 : 0;
}

function currentTimestamp() {
  return db.prepare("SELECT datetime('now') AS now").get().now;
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function clampDuration(duration) {
  const parsed = Number(duration);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.min(parsed, MAX_MEDIA_CLIP_SECONDS);
}

function safeMediaExtension(name, mimeType = '') {
  const extension = extname(name || '').toLowerCase();
  if (['.webm', '.mp4', '.mov', '.m4v', '.mp3', '.m4a', '.aac', '.wav', '.ogg', '.opus', '.weba'].includes(extension)) return extension;
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return '.mp3';
  if (mimeType.includes('m4a') || mimeType.includes('aac')) return '.m4a';
  if (mimeType.includes('wav')) return '.wav';
  if (mimeType.includes('ogg') || mimeType.includes('opus')) return '.ogg';
  if (mimeType.includes('mp4')) return '.mp4';
  return '.webm';
}

// Create annotation
app.post('/', async (c) => {
  const body = await c.req.json();
  const { user_id: rawUserId, source_url, source_title, source_type, source_domain, source_thumbnail,
          source_site_name, source_author, source_published_at, clip_text, clip_start_sec, clip_end_sec,
          clip_media_path, commentary, annotation_type, status } = body;

  if (!rawUserId || !source_url || !source_type || !commentary) {
    return c.json({ error: 'Missing required fields: user_id, source_url, source_type, commentary' }, 400);
  }
  if (String(commentary).trim().length > MAX_COMMENTARY_LENGTH) {
    return c.json({ error: `commentary must be ${MAX_COMMENTARY_LENGTH} characters or fewer` }, 400);
  }

  const user_id = resolveUserId(rawUserId);
  if (!user_id) {
    return c.json({ error: `User not found: ${rawUserId}` }, 404);
  }

  const user = getUserById(user_id);
  if (userUnavailable(user)) return c.json({ error: 'Account unavailable' }, 403);
  const requestedStatus = normalizeRequestedStatus(status, 'draft');
  const finalStatus = isPaidUser(user) ? requestedStatus : 'published';
  const publishedAt = finalStatus === 'published' ? currentTimestamp() : null;
  const id = nanoid(12);
  const safeAnnotationType = ANNOTATION_TYPES.has(annotation_type) ? annotation_type : 'Opinion';
  db.prepare(`
    INSERT INTO annotations (id, user_id, source_url, source_title, source_type, source_domain, source_site_name,
      source_author, source_published_at, source_thumbnail, clip_text, clip_start_sec, clip_end_sec,
      clip_media_path, commentary, annotation_type, status, published_at, is_public)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, user_id, source_url, source_title, source_type, source_domain, source_site_name || null,
    source_author || null, source_published_at || null, source_thumbnail || null, clip_text || null,
    clip_start_sec || null, clip_end_sec || null, clip_media_path || null, commentary, safeAnnotationType,
    finalStatus, publishedAt, visibilityForStatus(finalStatus));

  return c.json({ id, user_id, status: finalStatus, published_at: publishedAt, created: true }, 201);
});

// Attach a browser-recorded video clip to an annotation
app.post('/:id/clip-upload', async (c) => {
  const { id } = c.req.param();
  const annotation = db.prepare('SELECT id FROM annotations WHERE id = ?').get(id);
  if (!annotation) return c.json({ error: 'Annotation not found' }, 404);

  const body = await c.req.parseBody();
  const file = body.clip || body.file;
  if (!file || typeof file.arrayBuffer !== 'function') {
    return c.json({ error: 'clip file required' }, 400);
  }

  const startSec = positiveNumber(body.start, 0);
  const requestedEndSec = positiveNumber(body.end, startSec + MAX_MEDIA_CLIP_SECONDS);
  const duration = clampDuration(requestedEndSec - startSec);
  const endSec = startSec + duration;
  const originalName = typeof file.name === 'string' ? file.name : '';
  const extension = safeMediaExtension(originalName, file.type);
  const clipId = nanoid(12);
  const filename = `${clipId}${extension}`;
  const localPath = join(MEDIA_DIR, filename);

  await writeFile(localPath, Buffer.from(await file.arrayBuffer()));

  const mediaPath = `/media/${filename}`;
  db.prepare(`
    UPDATE annotations
    SET clip_media_path = ?, clip_start_sec = ?, clip_end_sec = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(mediaPath, startSec, endSec, id);

  return c.json({ id, clipId, mediaPath, startSec, endSec, duration, type: 'upload' });
});

// Extract a source clip server-side and attach it to an annotation
app.post('/:id/source-clip', async (c) => {
  const { id } = c.req.param();
  const annotation = db.prepare('SELECT * FROM annotations WHERE id = ?').get(id);
  if (!annotation) return c.json({ error: 'Annotation not found' }, 404);

  const body = await c.req.json().catch(() => ({}));
  const sourceType = body.source_type || annotation.source_type;
  const url = body.url || annotation.source_url;
  const startSec = positiveNumber(body.start, annotation.clip_start_sec || 0);
  const requestedEndSec = positiveNumber(body.end, annotation.clip_end_sec || startSec + MAX_MEDIA_CLIP_SECONDS);
  const endSec = startSec + clampDuration(requestedEndSec - startSec);

  if (!url) return c.json({ error: 'source url required' }, 400);
  if (!['podcast', 'youtube'].includes(sourceType)) {
    return c.json({ error: `Source extraction unavailable for ${sourceType || 'unknown'} clips` }, 400);
  }

  let clip;
  try {
    clip = sourceType === 'podcast'
      ? await extractPodcastClip({ url, start: startSec, end: endSec, mediaDir: MEDIA_DIR })
      : await extractYouTubeClip({ url, start: startSec, end: endSec, mediaDir: MEDIA_DIR });
  } catch (error) {
    return c.json({ error: 'Failed to attach source clip', detail: error.message }, 500);
  }

  db.prepare(`
    UPDATE annotations
    SET clip_media_path = ?,
        clip_start_sec = ?,
        clip_end_sec = ?,
        source_title = ?,
        source_thumbnail = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(
    clip.mediaPath,
    clip.startSec,
    clip.endSec,
    clip.title || annotation.source_title || '',
    clip.thumbnail || annotation.source_thumbnail || null,
    id,
  );

  return c.json({ id, ...clip });
});

// Publish a paid user's draft annotation
app.patch('/:id/publish', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json().catch(() => ({}));
  const user_id = resolveUserId(body.user_id);
  if (!user_id) return c.json({ error: 'Missing or invalid user_id' }, 400);

  const user = getUserById(user_id);
  if (userUnavailable(user)) return c.json({ error: 'Account unavailable' }, 403);
  if (!isPaidUser(user)) return c.json({ error: 'Draft publishing requires a paid subscription' }, 403);

  const annotation = db.prepare('SELECT * FROM annotations WHERE id = ? AND user_id = ? AND status != ?')
    .get(id, user_id, 'removed');
  if (!annotation) return c.json({ error: 'Annotation not found' }, 404);

  const publishedAt = annotation.published_at || currentTimestamp();
  db.prepare(`
    UPDATE annotations
    SET status = 'published',
        is_public = 1,
        published_at = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(publishedAt, id);

  return c.json({ id, status: 'published', published_at: publishedAt });
});

// Update annotation
app.patch('/:id', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const allowed = ['commentary', 'is_public', 'annotation_type', 'status'];
  const updates = [];
  const params = [];

  for (const key of allowed) {
    if (body[key] !== undefined) {
      if (key === 'annotation_type' && !ANNOTATION_TYPES.has(body[key])) continue;
      if (key === 'commentary' && String(body[key] || '').trim().length > MAX_COMMENTARY_LENGTH) {
        return c.json({ error: `commentary must be ${MAX_COMMENTARY_LENGTH} characters or fewer` }, 400);
      }
      if (key === 'status') {
        const user_id = resolveUserId(body.user_id);
        if (!user_id) return c.json({ error: 'Missing or invalid user_id' }, 400);
        const annotation = db.prepare('SELECT * FROM annotations WHERE id = ? AND user_id = ? AND status != ?')
          .get(id, user_id, 'removed');
        if (!annotation) return c.json({ error: 'Annotation not found' }, 404);
        const user = getUserById(user_id);
        if (userUnavailable(user)) return c.json({ error: 'Account unavailable' }, 403);
        if (!isPaidUser(user)) return c.json({ error: 'Draft status changes require a paid subscription' }, 403);
        const nextStatus = normalizeRequestedStatus(body.status, annotation.status || 'draft');
        updates.push('status = ?', 'is_public = ?', 'published_at = ?');
        params.push(nextStatus, visibilityForStatus(nextStatus), nextStatus === 'published' ? (annotation.published_at || currentTimestamp()) : null);
        continue;
      }
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
  const user = getUserById(user_id);
  if (userUnavailable(user)) return c.json({ error: 'Account unavailable' }, 403);

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

// Remove annotation from public/profile surfaces while keeping the audit trail.
app.delete('/:id', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json().catch(() => ({}));
  const user_id = resolveUserId(body.user_id);
  if (!user_id) return c.json({ error: 'Missing or invalid user_id' }, 400);
  const user = getUserById(user_id);
  if (userUnavailable(user)) return c.json({ error: 'Account unavailable' }, 403);

  const annotation = db.prepare('SELECT id FROM annotations WHERE id = ? AND user_id = ?')
    .get(id, user_id);
  if (!annotation) return c.json({ error: 'Annotation not found' }, 404);

  db.prepare(`
    UPDATE annotations
    SET status = 'removed',
        is_public = 0,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(id);
  return c.json({ removed: true });
});

// Add comment (supports nested replies via parent_id)
app.post('/:id/comments', async (c) => {
  const { id: annotation_id } = c.req.param();
  const { user_id: rawUserId, body: commentBody, parent_id } = await c.req.json();

  if (!rawUserId || !commentBody) return c.json({ error: 'Missing user_id or body' }, 400);
  const user_id = resolveUserId(rawUserId);
  if (!user_id) return c.json({ error: `User not found: ${rawUserId}` }, 404);
  const user = getUserById(user_id);
  if (userUnavailable(user)) return c.json({ error: 'Account unavailable' }, 403);

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

  const comment = db.prepare(`
    SELECT c.*, u.username, u.display_name, u.avatar_url
    FROM comments c JOIN users u ON c.user_id = u.id
    WHERE c.id = ?
  `).get(id);

  return c.json({ ...comment, replies: [], created: true }, 201);
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
  const user = getUserById(user_id);
  if (userUnavailable(user)) return c.json({ error: 'Account unavailable' }, 403);

  const existing = db.prepare('SELECT 1 FROM likes WHERE user_id = ? AND annotation_id = ?')
    .get(user_id, annotation_id);

  if (existing) {
    db.prepare('DELETE FROM likes WHERE user_id = ? AND annotation_id = ?')
      .run(user_id, annotation_id);
    db.prepare('UPDATE annotations SET like_count = MAX(0, like_count - 1) WHERE id = ?')
      .run(annotation_id);
    recalculateCredibility(annotation_id);
    return c.json({ liked: false });
  } else {
    db.prepare('INSERT INTO likes (user_id, annotation_id) VALUES (?, ?)')
      .run(user_id, annotation_id);
    db.prepare('UPDATE annotations SET like_count = like_count + 1 WHERE id = ?')
      .run(annotation_id);
    recalculateCredibility(annotation_id);
    return c.json({ liked: true });
  }
});

// Pin/unpin
app.post('/:id/pin', async (c) => {
  const { id: annotation_id } = c.req.param();
  const { user_id: rawUserId } = await c.req.json();
  const user_id = resolveUserId(rawUserId) || rawUserId;
  const user = getUserById(user_id);
  if (userUnavailable(user)) return c.json({ error: 'Account unavailable' }, 403);

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
      COALESCE(SUM(like_count), 0) AS credible,
      COALESCE(SUM(CASE WHEN annotation_type = 'Fact Check' THEN 1 ELSE 0 END), 0) AS fact_checks
    FROM annotations
    WHERE user_id = ? AND status = 'published'
  `).get(row.user_id);
  const score = Number(stats.credible || 0)
    + Number(stats.noteworthy || 0)
    + Number(stats.fact_checks || 0) * 3
    + Number(stats.annotations || 0);
  db.prepare('UPDATE users SET credibility_score = ? WHERE id = ?').run(score, row.user_id);
}

export default app;
