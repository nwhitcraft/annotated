const Database = require('better-sqlite3');

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  provider TEXT,
  provider_id TEXT,
  email TEXT,
  synced_at TEXT,
  conflict_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  source_url TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_title TEXT,
  source_domain TEXT,
  source_thumbnail TEXT,
  clip_text TEXT,
  clip_start_sec INTEGER,
  clip_end_sec INTEGER,
  clip_media_path TEXT,
  commentary TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  is_public INTEGER NOT NULL DEFAULT 0,
  synced_at TEXT,
  conflict_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  annotation_id TEXT NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  parent_id TEXT REFERENCES comments(id),
  body TEXT NOT NULL,
  synced_at TEXT,
  conflict_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS likes (
  annotation_id TEXT NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  synced_at TEXT,
  conflict_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (annotation_id, user_id)
);

CREATE TABLE IF NOT EXISTS pins (
  annotation_id TEXT NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  synced_at TEXT,
  conflict_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (annotation_id, user_id)
);

CREATE TABLE IF NOT EXISTS follows (
  follower_id TEXT NOT NULL REFERENCES users(id),
  following_id TEXT NOT NULL REFERENCES users(id),
  synced_at TEXT,
  conflict_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (follower_id, following_id)
);
`;

function migrate(path) {
  const db = new Database(path);
  db.exec(schema);
  return db;
}

module.exports = { migrate, schema };
