import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..', 'data');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(join(DATA_DIR, 'annotated.db'));

// WAL mode for better concurrent reads
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- Schema ---
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    bio TEXT,
    provider TEXT NOT NULL,          -- 'google' or 'twitter'
    provider_id TEXT NOT NULL,
    email TEXT,
    blocked INTEGER DEFAULT 0,
    blocked_until TEXT,
    blocked_reason TEXT,
    deleted_at TEXT,
    deletion_reason TEXT,
    subscription_tier TEXT DEFAULT 'free',
    age INTEGER,
    onboarding_completed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(provider, provider_id)
  );

  CREATE TABLE IF NOT EXISTS annotations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    source_url TEXT NOT NULL,
    source_title TEXT,
    source_type TEXT NOT NULL,       -- 'article', 'youtube', 'podcast', 'twitter'
    source_domain TEXT,
    source_site_name TEXT,
    source_author TEXT,
    source_published_at TEXT,
    source_thumbnail TEXT,

    -- The clip
    clip_text TEXT,                   -- highlighted text for articles
    clip_start_sec REAL,             -- start time for video/audio
    clip_end_sec REAL,               -- end time for video/audio
    clip_media_path TEXT,            -- path to stored video/audio clip file

    -- The annotation
    commentary TEXT NOT NULL,
    annotation_type TEXT DEFAULT 'Opinion',
    status TEXT DEFAULT 'draft',      -- 'draft', 'published', 'removed'
    published_at TEXT,
    
    -- Metadata
    is_public INTEGER DEFAULT 0,
    pin_count INTEGER DEFAULT 0,
    noteworthy_count INTEGER DEFAULT 0,
    claim_count INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    annotation_id TEXT NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS follows (
    follower_id TEXT NOT NULL REFERENCES users(id),
    following_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (follower_id, following_id)
  );

  CREATE TABLE IF NOT EXISTS pins (
    user_id TEXT NOT NULL REFERENCES users(id),
    annotation_id TEXT NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, annotation_id)
  );

  CREATE TABLE IF NOT EXISTS likes (
    user_id TEXT NOT NULL REFERENCES users(id),
    annotation_id TEXT NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, annotation_id)
  );

  CREATE TABLE IF NOT EXISTS noteworthy (
    user_id TEXT NOT NULL REFERENCES users(id),
    annotation_id TEXT NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, annotation_id)
  );

  CREATE TABLE IF NOT EXISTS claims (
    id TEXT PRIMARY KEY,
    annotation_id TEXT NOT NULL REFERENCES annotations(id),
    claimant_email TEXT NOT NULL,
    reason TEXT,
    reason_code TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT DEFAULT 'pending',    -- 'pending', 'reviewed', 'resolved', 'annotation_removed', 'user_blocked'
    reviewer_note TEXT,
    outcome TEXT,
    reviewed_at TEXT,
    resolved_at TEXT,
    email_notification_status TEXT DEFAULT 'not_sent',
    email_notification_error TEXT,
    emailed_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS banned_identities (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    provider TEXT,
    provider_id TEXT,
    email TEXT,
    username TEXT,
    reason TEXT,
    banned_until TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Indexes
  CREATE INDEX IF NOT EXISTS idx_annotations_user ON annotations(user_id);
  CREATE INDEX IF NOT EXISTS idx_annotations_created ON annotations(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_annotations_source_type ON annotations(source_type);
  CREATE INDEX IF NOT EXISTS idx_comments_annotation ON comments(annotation_id);
  CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);
  CREATE INDEX IF NOT EXISTS idx_likes_annotation ON likes(annotation_id);
  CREATE INDEX IF NOT EXISTS idx_noteworthy_annotation ON noteworthy(annotation_id);
  CREATE INDEX IF NOT EXISTS idx_comments_created ON comments(created_at DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
  CREATE INDEX IF NOT EXISTS idx_banned_provider ON banned_identities(provider, provider_id, banned_until);
  CREATE INDEX IF NOT EXISTS idx_banned_email ON banned_identities(email, banned_until);
  CREATE INDEX IF NOT EXISTS idx_banned_username ON banned_identities(username, banned_until);
`);

const annotationColumnsBeforeMigration = db.prepare('PRAGMA table_info(annotations)').all().map((column) => column.name);
const userColumnsBeforeMigration = db.prepare('PRAGMA table_info(users)').all().map((column) => column.name);

// Add like_count column if missing (safe migration)
try {
  db.exec(`ALTER TABLE annotations ADD COLUMN like_count INTEGER DEFAULT 0`);
} catch { /* column already exists */ }

for (const statement of [
  `ALTER TABLE annotations ADD COLUMN source_site_name TEXT`,
  `ALTER TABLE annotations ADD COLUMN source_author TEXT`,
  `ALTER TABLE annotations ADD COLUMN source_published_at TEXT`,
  `ALTER TABLE annotations ADD COLUMN annotation_type TEXT DEFAULT 'Opinion'`,
  `ALTER TABLE annotations ADD COLUMN status TEXT DEFAULT 'draft'`,
  `ALTER TABLE annotations ADD COLUMN published_at TEXT`,
  `ALTER TABLE annotations ADD COLUMN noteworthy_count INTEGER DEFAULT 0`,
  `ALTER TABLE annotations ADD COLUMN claim_count INTEGER DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN credibility_score INTEGER DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN link TEXT`,
  `ALTER TABLE users ADD COLUMN twitter_handle TEXT`,
  `ALTER TABLE users ADD COLUMN blocked INTEGER DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN blocked_until TEXT`,
  `ALTER TABLE users ADD COLUMN blocked_reason TEXT`,
  `ALTER TABLE users ADD COLUMN deleted_at TEXT`,
  `ALTER TABLE users ADD COLUMN deletion_reason TEXT`,
  `ALTER TABLE users ADD COLUMN subscription_tier TEXT DEFAULT 'free'`,
  `ALTER TABLE users ADD COLUMN age INTEGER`,
  `ALTER TABLE users ADD COLUMN onboarding_completed INTEGER DEFAULT 0`,
  `ALTER TABLE claims ADD COLUMN reason TEXT`,
  `ALTER TABLE claims ADD COLUMN reason_code TEXT`,
  `ALTER TABLE claims ADD COLUMN description TEXT`,
  `ALTER TABLE claims ADD COLUMN reviewer_note TEXT`,
  `ALTER TABLE claims ADD COLUMN outcome TEXT`,
  `ALTER TABLE claims ADD COLUMN reviewed_at TEXT`,
  `ALTER TABLE claims ADD COLUMN resolved_at TEXT`,
  `ALTER TABLE claims ADD COLUMN email_notification_status TEXT DEFAULT 'not_sent'`,
  `ALTER TABLE claims ADD COLUMN email_notification_error TEXT`,
  `ALTER TABLE claims ADD COLUMN emailed_at TEXT`,
]) {
  try {
    db.exec(statement);
  } catch { /* column already exists */ }
}

db.exec(`CREATE INDEX IF NOT EXISTS idx_annotations_type ON annotations(annotation_type)`);

if (!annotationColumnsBeforeMigration.includes('status')) {
  db.exec(`
    UPDATE annotations
    SET status = 'published',
        published_at = COALESCE(published_at, created_at),
        is_public = 1
    WHERE status = 'draft' OR status IS NULL
  `);
}

if (!userColumnsBeforeMigration.includes('onboarding_completed')) {
  db.exec(`
    UPDATE users
    SET onboarding_completed = 1
    WHERE onboarding_completed IS NULL OR onboarding_completed = 0
  `);
}

db.exec(`
  UPDATE annotations SET status = 'published' WHERE status IS NULL;
  UPDATE annotations SET is_public = 0 WHERE status IN ('draft', 'removed');
  UPDATE annotations SET published_at = COALESCE(published_at, created_at) WHERE status = 'published';
  UPDATE users SET onboarding_completed = 0 WHERE onboarding_completed IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS noteworthy (
    user_id TEXT NOT NULL REFERENCES users(id),
    annotation_id TEXT NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, annotation_id)
  );
  CREATE INDEX IF NOT EXISTS idx_noteworthy_annotation ON noteworthy(annotation_id);
  CREATE INDEX IF NOT EXISTS idx_annotations_type ON annotations(annotation_type);
  CREATE TABLE IF NOT EXISTS banned_identities (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    provider TEXT,
    provider_id TEXT,
    email TEXT,
    username TEXT,
    reason TEXT,
    banned_until TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_banned_provider ON banned_identities(provider, provider_id, banned_until);
  CREATE INDEX IF NOT EXISTS idx_banned_email ON banned_identities(email, banned_until);
  CREATE INDEX IF NOT EXISTS idx_banned_username ON banned_identities(username, banned_until);
`);

// Add parent_id to comments for nested replies if missing
try {
  db.exec(`ALTER TABLE comments ADD COLUMN parent_id TEXT REFERENCES comments(id)`);
} catch { /* column already exists */ }

db.prepare(`
  INSERT INTO users (id, username, display_name, avatar_url, bio, provider, provider_id, email, onboarding_completed)
  VALUES ('demo-user', 'demo', 'Demo User', null, 'Local extension testing account', 'local', 'demo-user', null, 1)
  ON CONFLICT(id) DO UPDATE SET
    username = excluded.username,
    display_name = excluded.display_name,
    provider = excluded.provider,
    provider_id = excluded.provider_id,
    onboarding_completed = COALESCE(users.onboarding_completed, excluded.onboarding_completed),
    updated_at = datetime('now')
`).run();

export default db;
