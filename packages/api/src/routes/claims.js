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
  db.prepare('UPDATE annotations SET claim_count = claim_count + 1 WHERE id = ?')
    .run(annotation_id);

  return c.json({ id, filed: true }, 201);
});

// List claims (admin)
app.get('/', (c) => {
  const { status = 'pending' } = c.req.query();
  const items = db.prepare('SELECT c.*, a.source_url, a.source_title FROM claims c JOIN annotations a ON c.annotation_id = a.id WHERE c.status = ? ORDER BY c.created_at DESC').all(status);
  return c.json({ items });
});

// Update claim status (MVP admin: any logged-in user once auth is enabled)
app.patch('/:id', async (c) => {
  const { id } = c.req.param();
  const { status } = await c.req.json();
  if (!['pending', 'reviewed', 'resolved'].includes(status)) {
    return c.json({ error: 'Invalid status' }, 400);
  }

  const result = db.prepare('UPDATE claims SET status = ? WHERE id = ?').run(status, id);
  if (!result.changes) return c.json({ error: 'Claim not found' }, 404);
  return c.json({ updated: true, status });
});

// Delete a claim and keep annotation claim_count in sync
app.delete('/:id', (c) => {
  const { id } = c.req.param();
  const claim = db.prepare('SELECT annotation_id FROM claims WHERE id = ?').get(id);
  if (!claim) return c.json({ error: 'Claim not found' }, 404);

  db.prepare('DELETE FROM claims WHERE id = ?').run(id);
  db.prepare('UPDATE annotations SET claim_count = MAX(0, claim_count - 1) WHERE id = ?')
    .run(claim.annotation_id);
  return c.json({ deleted: true });
});

export default app;
