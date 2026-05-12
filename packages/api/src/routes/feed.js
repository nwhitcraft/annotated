import { Hono } from 'hono';
import db from '../db.js';

const app = new Hono();

// Page feed — annotations on the active source, followed users first.
app.get('/page', (c) => {
  const { url, viewer_id = 'demo-user', limit = '50' } = c.req.query();
  if (!url) return c.json({ error: 'url required' }, 400);

  const variants = sourceUrlVariants(url);
  const cappedLimit = Math.min(Math.max(Number(limit) || 50, 1), 50);
  const placeholders = variants.map(() => '?').join(', ');

  const items = db.prepare(`
    SELECT a.*, u.username, u.display_name, u.avatar_url,
      CASE WHEN f.follower_id IS NOT NULL THEN 1 ELSE 0 END AS followed_by_viewer
    FROM annotations a
    JOIN users u ON a.user_id = u.id
    LEFT JOIN follows f ON f.following_id = a.user_id AND f.follower_id = ?
    WHERE a.is_public = 1 AND a.status = 'published' AND a.source_url IN (${placeholders})
    ORDER BY followed_by_viewer DESC, a.created_at DESC
    LIMIT ?
  `).all(viewer_id, ...variants, cappedLimit);

  return c.json({ items, page_url: url, matched: items.length > 0 });
});

// Public feed — latest annotations from everyone
app.get('/', (c) => {
  const { limit = '20', offset = '0', type, annotation_type } = c.req.query();
  
  let sql = `
    SELECT a.*, u.username, u.display_name, u.avatar_url 
    FROM annotations a 
    JOIN users u ON a.user_id = u.id 
    WHERE a.is_public = 1 AND a.status = 'published'
  `;
  const params = [];

  if (type) {
    sql += ' AND a.source_type = ?';
    params.push(type);
  }
  if (annotation_type) {
    sql += ' AND a.annotation_type = ?';
    params.push(annotation_type);
  }

  sql += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const items = db.prepare(sql).all(...params);
  return c.json({ items });
});

// Following feed — annotations from people you follow
app.get('/following/:userId', (c) => {
  const { userId } = c.req.param();
  const { limit = '20', offset = '0' } = c.req.query();

  const items = db.prepare(`
    SELECT a.*, u.username, u.display_name, u.avatar_url 
    FROM annotations a 
    JOIN users u ON a.user_id = u.id 
    JOIN follows f ON f.following_id = a.user_id 
    WHERE f.follower_id = ? AND a.is_public = 1 AND a.status = 'published'
    ORDER BY a.created_at DESC LIMIT ? OFFSET ?
  `).all(userId, Number(limit), Number(offset));

  return c.json({ items });
});

// Trending — most pinned in last 7 days
app.get('/trending', (c) => {
  const { limit = '20' } = c.req.query();

  const items = db.prepare(`
    SELECT a.*, u.username, u.display_name, u.avatar_url 
    FROM annotations a 
    JOIN users u ON a.user_id = u.id 
    WHERE a.is_public = 1 AND a.status = 'published' AND a.created_at >= datetime('now', '-7 days')
    ORDER BY a.noteworthy_count DESC, a.pin_count DESC, a.comment_count DESC
    LIMIT ?
  `).all(Number(limit));

  return c.json({ items });
});

function sourceUrlVariants(value) {
  const variants = new Set([value]);
  try {
    const parsed = new URL(value);
    const youtubeId = youtubeVideoId(parsed);
    if (youtubeId) {
      variants.add(`https://www.youtube.com/watch?v=${youtubeId}`);
      variants.add(`https://youtube.com/watch?v=${youtubeId}`);
      variants.add(`https://m.youtube.com/watch?v=${youtubeId}`);
      variants.add(`https://youtu.be/${youtubeId}`);
      variants.add(`https://www.youtube.com/shorts/${youtubeId}`);
    }
    parsed.hash = '';
    variants.add(parsed.toString());
    parsed.search = '';
    variants.add(parsed.toString());
    const noTrailingSlash = parsed.toString().replace(/\/$/, '');
    variants.add(noTrailingSlash);
  } catch {
    variants.add(value.replace(/#.*$/, '').replace(/\?.*$/, '').replace(/\/$/, ''));
  }
  return [...variants].filter(Boolean);
}

function youtubeVideoId(url) {
  const host = url.hostname.replace(/^www\./, '');
  if (host === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] || '';
  if (host === 'youtube.com' || host === 'm.youtube.com') {
    if (url.pathname === '/watch') return url.searchParams.get('v') || '';
    const parts = url.pathname.split('/').filter(Boolean);
    if (['shorts', 'embed', 'live'].includes(parts[0])) return parts[1] || '';
  }
  return '';
}

export default app;
