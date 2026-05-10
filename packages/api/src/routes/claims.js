import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import db from '../db.js';

const app = new Hono();

// File a fair-use claim against an annotation
app.post('/', async (c) => {
  const { annotation_id, claimant_email, reason } = await c.req.json();

  if (!annotation_id || !claimant_email || !reason) {
    return c.json({ error: 'Missing required fields: annotation_id, claimant_email, reason' }, 400);
  }

  const annotation = db.prepare('SELECT id FROM annotations WHERE id = ?').get(annotation_id);
  if (!annotation) return c.json({ error: 'Annotation not found' }, 404);

  const id = nanoid(12);
  db.prepare('INSERT INTO claims (id, annotation_id, claimant_email, reason) VALUES (?, ?, ?, ?)')
    .run(id, annotation_id, claimant_email, reason);

  return c.json({ id, filed: true }, 201);
});

// List claims (admin)
app.get('/', (c) => {
  const { status = 'pending' } = c.req.query();
  const items = db.prepare('SELECT c.*, a.source_url, a.source_title FROM claims c JOIN annotations a ON c.annotation_id = a.id WHERE c.status = ? ORDER BY c.created_at DESC').all(status);
  return c.json({ items });
});

export default app;
