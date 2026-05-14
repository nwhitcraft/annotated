import { nanoid } from 'nanoid';
import db from '../db.js';

export function activeIdentityBan({ provider, provider_id, email, username }) {
  const normalizedEmail = normalize(email);
  const normalizedUsername = normalize(username);
  return db.prepare(`
    SELECT *
    FROM banned_identities
    WHERE datetime(banned_until) > datetime('now')
      AND (
        (provider IS NOT NULL AND provider_id IS NOT NULL AND provider = ? AND provider_id = ?)
        OR (email IS NOT NULL AND lower(email) = lower(?))
        OR (username IS NOT NULL AND lower(username) = lower(?))
      )
    ORDER BY created_at DESC
    LIMIT 1
  `).get(provider || '', provider_id || '', normalizedEmail || '', normalizedUsername || '') || null;
}

export function userUnavailable(user) {
  if (!user) return true;
  if (user.deleted_at) return true;
  if (!Number(user.blocked || 0)) return false;
  if (!user.blocked_until) return true;
  const row = db.prepare("SELECT datetime(?) > datetime('now') AS active").get(user.blocked_until);
  return Boolean(row?.active);
}

export function banUserForClaim({ userId, claimId, reason = 'Report review' }) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return null;

  const bannedUntil = db.prepare("SELECT datetime('now', '+30 days') AS value").get().value;
  const deletedUsername = deletedUsernameFor(user.id);

  const affectedComments = db.prepare(`
    SELECT annotation_id, COUNT(*) AS count
    FROM comments
    WHERE user_id = ?
    GROUP BY annotation_id
  `).all(user.id);
  const affectedLikes = db.prepare(`
    SELECT annotation_id, COUNT(*) AS count
    FROM likes
    WHERE user_id = ?
    GROUP BY annotation_id
  `).all(user.id);
  const affectedNoteworthy = db.prepare(`
    SELECT annotation_id, COUNT(*) AS count
    FROM noteworthy
    WHERE user_id = ?
    GROUP BY annotation_id
  `).all(user.id);
  const affectedPins = db.prepare(`
    SELECT annotation_id, COUNT(*) AS count
    FROM pins
    WHERE user_id = ?
    GROUP BY annotation_id
  `).all(user.id);

  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO banned_identities (id, user_id, provider, provider_id, email, username, reason, banned_until)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      nanoid(12),
      user.id,
      user.provider || null,
      user.provider_id || null,
      normalize(user.email),
      normalize(user.username),
      reason,
      bannedUntil,
    );

    db.prepare(`
      UPDATE annotations
      SET status = 'removed',
          is_public = 0,
          updated_at = datetime('now')
      WHERE user_id = ?
    `).run(user.id);

    db.prepare('DELETE FROM follows WHERE follower_id = ? OR following_id = ?').run(user.id, user.id);
    db.prepare('DELETE FROM likes WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM noteworthy WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM pins WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM comments WHERE user_id = ?').run(user.id);
    for (const row of affectedLikes) {
      db.prepare('UPDATE annotations SET like_count = MAX(0, like_count - ?) WHERE id = ?')
        .run(Number(row.count || 0), row.annotation_id);
    }
    for (const row of affectedNoteworthy) {
      db.prepare('UPDATE annotations SET noteworthy_count = MAX(0, noteworthy_count - ?) WHERE id = ?')
        .run(Number(row.count || 0), row.annotation_id);
    }
    for (const row of affectedPins) {
      db.prepare('UPDATE annotations SET pin_count = MAX(0, pin_count - ?) WHERE id = ?')
        .run(Number(row.count || 0), row.annotation_id);
    }
    for (const row of affectedComments) {
      db.prepare('UPDATE annotations SET comment_count = MAX(0, comment_count - ?) WHERE id = ?')
        .run(Number(row.count || 0), row.annotation_id);
    }

    db.prepare(`
      UPDATE users
      SET username = ?,
          display_name = 'Deleted user',
          avatar_url = NULL,
          bio = NULL,
          link = NULL,
          twitter_handle = NULL,
          provider = 'deleted',
          provider_id = ?,
          email = NULL,
          blocked = 1,
          blocked_until = ?,
          blocked_reason = ?,
          deleted_at = datetime('now'),
          deletion_reason = ?,
          subscription_tier = 'free',
          updated_at = datetime('now')
      WHERE id = ?
    `).run(deletedUsername, `deleted-${user.id}`, bannedUntil, reason, reason, user.id);

    if (claimId) {
      db.prepare(`
        UPDATE claims
        SET status = 'user_blocked',
            outcome = COALESCE(outcome, 'User account removed and identity banned for 30 days.'),
            resolved_at = datetime('now')
        WHERE id = ?
      `).run(claimId);
    }
  });

  transaction();
  return { user_id: user.id, banned_until: bannedUntil, deleted_username: deletedUsername };
}

function normalize(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || null;
}

function deletedUsernameFor(userId) {
  const base = `deleted_${String(userId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || nanoid(6)}`.toLowerCase();
  let candidate = base.slice(0, 20);
  let index = 1;
  while (db.prepare('SELECT 1 FROM users WHERE username = ?').get(candidate)) {
    const suffix = `_${index}`;
    candidate = `${base.slice(0, 20 - suffix.length)}${suffix}`;
    index += 1;
  }
  return candidate;
}
