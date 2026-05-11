import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

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
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(provider, provider_id)
  );

  CREATE TABLE IF NOT EXISTS annotations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    source_url TEXT NOT NULL,
    source_title TEXT,
    source_type TEXT NOT NULL,       -- 'article', 'youtube', 'podcast'
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
    
    -- Metadata
    is_public INTEGER DEFAULT 1,
    pin_count INTEGER DEFAULT 0,
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

  CREATE TABLE IF NOT EXISTS claims (
    id TEXT PRIMARY KEY,
    annotation_id TEXT NOT NULL REFERENCES annotations(id),
    claimant_email TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'pending',    -- 'pending', 'reviewed', 'resolved'
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Indexes
  CREATE INDEX IF NOT EXISTS idx_annotations_user ON annotations(user_id);
  CREATE INDEX IF NOT EXISTS idx_annotations_created ON annotations(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_annotations_source_type ON annotations(source_type);
  CREATE INDEX IF NOT EXISTS idx_comments_annotation ON comments(annotation_id);
  CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);
  CREATE INDEX IF NOT EXISTS idx_likes_annotation ON likes(annotation_id);
  CREATE INDEX IF NOT EXISTS idx_comments_created ON comments(created_at DESC);
`);

// Add like_count column if missing (safe migration)
try {
  db.exec(`ALTER TABLE annotations ADD COLUMN like_count INTEGER DEFAULT 0`);
} catch { /* column already exists */ }

for (const statement of [
  `ALTER TABLE annotations ADD COLUMN source_site_name TEXT`,
  `ALTER TABLE annotations ADD COLUMN source_author TEXT`,
  `ALTER TABLE annotations ADD COLUMN source_published_at TEXT`,
]) {
  try {
    db.exec(statement);
  } catch { /* column already exists */ }
}

// Add parent_id to comments for nested replies if missing
try {
  db.exec(`ALTER TABLE comments ADD COLUMN parent_id TEXT REFERENCES comments(id)`);
} catch { /* column already exists */ }

db.prepare(`
  INSERT INTO users (id, username, display_name, avatar_url, bio, provider, provider_id, email)
  VALUES ('demo-user', 'demo', 'Demo User', null, 'Local extension testing account', 'local', 'demo-user', null)
  ON CONFLICT(id) DO UPDATE SET
    username = excluded.username,
    display_name = excluded.display_name,
    provider = excluded.provider,
    provider_id = excluded.provider_id,
    updated_at = datetime('now')
`).run();

export default db;
