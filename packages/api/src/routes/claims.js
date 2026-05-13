import { Hono } from 'hono';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import db from '../db.js';
import { sendClaimNotificationEmail } from '../lib/email.js';
import { banUserForClaim, userUnavailable } from '../lib/moderation.js';

const app = new Hono();
const JWT_SECRET = process.env.JWT_SECRET || 'annotated-dev-secret-change-in-prod';
const ADMIN_USERNAMES = new Set(
  String(process.env.ADMIN_USERNAMES || 'nwhitcraft,demo')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);

// Claim reason codes
const REASON_CODES = [
  'copyright',
  'misrepresentation',
  'defamation',
  'privacy',
  'harassment',
  'other',
];

// File a fair-use claim against an annotation
app.post('/', async (c) => {
  const { annotation_id, claimant_email, reason_code, description } = await c.req.json();

  if (!annotation_id || !claimant_email || !reason_code || !description) {
    return c.json({ error: 'Missing required fields: annotation_id, claimant_email, reason_code, description' }, 400);
  }

  if (!REASON_CODES.includes(reason_code)) {
    return c.json({ error: 'Invalid reason code' }, 400);
  }

  const annotation = db.prepare(`
    SELECT a.*, u.username, u.display_name
    FROM annotations a
    JOIN users u ON u.id = a.user_id
    WHERE a.id = ?
  `).get(annotation_id);
  if (!annotation) return c.json({ error: 'Annotation not found' }, 404);

  const id = nanoid(12);
  db.prepare('INSERT INTO claims (id, annotation_id, claimant_email, reason, reason_code, description) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, annotation_id, claimant_email, reason_code, reason_code, description);
  db.prepare('UPDATE annotations SET claim_count = claim_count + 1 WHERE id = ?')
    .run(annotation_id);

  const claim = claimById(id);
  const notification = await sendClaimNotificationEmail({
    ...claim,
    ...annotation,
    id,
    annotation_id,
    claimant_email,
    reason_code,
    description,
  }).catch((error) => ({ status: 'failed', error: error.message || 'Claim notification failed' }));

  db.prepare(`
    UPDATE claims
    SET email_notification_status = ?,
        email_notification_error = ?,
        emailed_at = CASE WHEN ? = 'sent' THEN datetime('now') ELSE emailed_at END
    WHERE id = ?
  `).run(notification.status, notification.error || null, notification.status, id);

  return c.json({
    id,
    filed: true,
    notification: {
      status: notification.status,
      configured: notification.status !== 'not_configured',
    },
  }, 201);
});

// List claims (admin)
app.get('/', (c) => {
  const admin = requireAdmin(c);
  if (admin) return admin;

  const { status = 'pending' } = c.req.query();
  const filter = String(status || 'pending');
  const where = filter === 'all' ? '' : 'WHERE c.status = ?';
  const params = filter === 'all' ? [] : [filter];
  const items = db.prepare(`
    SELECT c.*, a.source_url, a.source_title, a.commentary, a.user_id,
      u.username, u.display_name, u.deleted_at, u.blocked, u.blocked_until
    FROM claims c
    JOIN annotations a ON c.annotation_id = a.id
    JOIN users u ON a.user_id = u.id
    ${where}
    ORDER BY c.created_at DESC
  `).all(...params);
  return c.json({ items });
});

// Update claim status (admin)
app.patch('/:id', async (c) => {
  const admin = requireAdmin(c);
  if (admin) return admin;

  const { id } = c.req.param();
  const { status, reviewer_note, outcome } = await c.req.json();
  if (!['pending', 'reviewed', 'resolved', 'annotation_removed', 'user_blocked'].includes(status)) {
    return c.json({ error: 'Invalid status' }, 400);
  }

  const result = db.prepare(`
    UPDATE claims
    SET status = ?,
        reviewer_note = COALESCE(?, reviewer_note),
        outcome = COALESCE(?, outcome),
        reviewed_at = CASE WHEN ? IN ('reviewed', 'resolved', 'annotation_removed', 'user_blocked') THEN COALESCE(reviewed_at, datetime('now')) ELSE reviewed_at END,
        resolved_at = CASE WHEN ? IN ('resolved', 'annotation_removed', 'user_blocked') THEN COALESCE(resolved_at, datetime('now')) ELSE resolved_at END
    WHERE id = ?
  `).run(status, cleanNullable(reviewer_note), cleanNullable(outcome), status, status, id);
  if (!result.changes) return c.json({ error: 'Claim not found' }, 404);

  // If action is to remove the annotation or block the user
  if (status === 'annotation_removed') {
    const claim = db.prepare('SELECT annotation_id FROM claims WHERE id = ?').get(id);
    if (claim) {
      db.prepare(`
        UPDATE annotations
        SET status = 'removed',
            is_public = 0,
            updated_at = datetime('now')
        WHERE id = ?
      `)
        .run(claim.annotation_id);
    }
  }

  return c.json({ updated: true, status });
});

// Permanently remove the annotation owner's account and stop the same identity signing up again for 30 days.
app.post('/:id/ban-user', async (c) => {
  const admin = requireAdmin(c);
  if (admin) return admin;

  const { id } = c.req.param();
  const body = await c.req.json().catch(() => ({}));
  const claim = db.prepare(`
    SELECT c.*, a.user_id
    FROM claims c
    JOIN annotations a ON a.id = c.annotation_id
    WHERE c.id = ?
  `).get(id);
  if (!claim) return c.json({ error: 'Claim not found' }, 404);

  const reason = cleanNullable(body.reason) || `Claim review: ${claim.reason_code || claim.reason || 'policy violation'}`;
  const result = banUserForClaim({ userId: claim.user_id, claimId: id, reason });
  if (!result) return c.json({ error: 'User not found' }, 404);
  return c.json({ banned: true, ...result });
});

// Block an annotation owner (admin legacy endpoint; now performs the same deletion + 30-day identity ban)
app.post('/block-user', async (c) => {
  const admin = requireAdmin(c);
  if (admin) return admin;

  const { user_id, claim_id, reason } = await c.req.json();
  if (!user_id) return c.json({ error: 'Missing user_id' }, 400);

  const result = banUserForClaim({ userId: user_id, claimId: claim_id, reason: reason || 'Claim review' });
  if (!result) return c.json({ error: 'User not found' }, 404);

  return c.json({ blocked: true, banned: true, ...result });
});

// Delete a claim and keep annotation claim_count in sync
app.delete('/:id', (c) => {
  const admin = requireAdmin(c);
  if (admin) return admin;

  const { id } = c.req.param();
  const claim = db.prepare('SELECT annotation_id FROM claims WHERE id = ?').get(id);
  if (!claim) return c.json({ error: 'Claim not found' }, 404);

  db.prepare('DELETE FROM claims WHERE id = ?').run(id);
  db.prepare('UPDATE annotations SET claim_count = MAX(0, claim_count - 1) WHERE id = ?')
    .run(claim.annotation_id);
  return c.json({ deleted: true });
});

export default app;

function claimById(id) {
  return db.prepare(`
    SELECT c.*, a.source_url, a.source_title, a.commentary, a.user_id,
      u.username, u.display_name
    FROM claims c
    JOIN annotations a ON c.annotation_id = a.id
    JOIN users u ON a.user_id = u.id
    WHERE c.id = ?
  `).get(id);
}

function cleanNullable(value) {
  const text = String(value || '').trim();
  return text || null;
}

function requireAdmin(c) {
  const adminToken = process.env.ADMIN_TOKEN;
  const suppliedAdminToken = c.req.header('x-admin-token');
  if (adminToken && suppliedAdminToken === adminToken) return null;

  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) return c.json({ error: 'Admin authentication required' }, 401);

  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
    if (userUnavailable(user)) return c.json({ error: 'Account unavailable' }, 403);
    if (!ADMIN_USERNAMES.has(String(user.username || '').toLowerCase())) {
      return c.json({ error: 'Admin access required' }, 403);
    }
    return null;
  } catch {
    return c.json({ error: 'Invalid admin token' }, 401);
  }
}
