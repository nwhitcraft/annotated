import { Hono } from 'hono';
import db from '../db.js';

const app = new Hono();

// Public feed — latest annotations from everyone
app.get('/', (c) => {
  const { limit = '20', offset = '0', type } = c.req.query();
  
  let sql = `
    SELECT a.*, u.username, u.display_name, u.avatar_url 
    FROM annotations a 
    JOIN users u ON a.user_id = u.id 
    WHERE a.is_public = 1
  `;
  const params = [];

  if (type) {
    sql += ' AND a.source_type = ?';
    params.push(type);
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
    WHERE f.follower_id = ? AND a.is_public = 1
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
    WHERE a.is_public = 1 AND a.created_at >= datetime('now', '-7 days')
    ORDER BY a.pin_count DESC, a.comment_count DESC
    LIMIT ?
  `).all(Number(limit));

  return c.json({ items });
});

export default app;
