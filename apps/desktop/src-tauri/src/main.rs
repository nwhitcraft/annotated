use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
struct LocalComment {
    id: String,
    body: String,
    created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Annotation {
    id: Option<String>,
    user_id: Option<String>,
    source_url: String,
    source_type: String,
    source_title: String,
    source_domain: String,
    source_thumbnail: Option<String>,
    clip_text: Option<String>,
    clip_start_sec: Option<i64>,
    clip_end_sec: Option<i64>,
    clip_media_path: Option<String>,
    commentary: String,
    tags: Option<Vec<String>>,
    is_public: Option<i64>,
    synced_at: Option<String>,
    conflict_version: Option<i64>,
    created_at: Option<String>,
    updated_at: Option<String>,
    comments: Option<Vec<LocalComment>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Settings {
    #[serde(rename = "apiEndpoint")]
    api_endpoint: String,
    hotkey: String,
    #[serde(rename = "storageLocation")]
    storage_location: String,
}

fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.join("annotated.sqlite"))
}

fn connect(app: &AppHandle) -> Result<Connection, String> {
    let conn = Connection::open(db_path(app)?).map_err(|error| error.to_string())?;
    migrate(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
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

        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_annotations_public ON annotations(is_public);
        CREATE INDEX IF NOT EXISTS idx_annotations_synced ON annotations(synced_at);
        CREATE INDEX IF NOT EXISTS idx_comments_annotation ON comments(annotation_id);
        CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);
        "#,
    )
    .map_err(|error| error.to_string())
}

fn row_to_annotation(row: &rusqlite::Row<'_>, comments: Vec<LocalComment>) -> rusqlite::Result<Annotation> {
    let tags_json: String = row.get("tags")?;
    let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();
    Ok(Annotation {
        id: Some(row.get("id")?),
        user_id: Some(row.get("user_id")?),
        source_url: row.get("source_url")?,
        source_type: row.get("source_type")?,
        source_title: row.get("source_title")?,
        source_domain: row.get("source_domain")?,
        source_thumbnail: row.get("source_thumbnail")?,
        clip_text: row.get("clip_text")?,
        clip_start_sec: row.get("clip_start_sec")?,
        clip_end_sec: row.get("clip_end_sec")?,
        clip_media_path: row.get("clip_media_path")?,
        commentary: row.get("commentary")?,
        tags: Some(tags),
        is_public: Some(row.get("is_public")?),
        synced_at: row.get("synced_at")?,
        conflict_version: Some(row.get("conflict_version")?),
        created_at: Some(row.get("created_at")?),
        updated_at: Some(row.get("updated_at")?),
        comments: Some(comments),
    })
}

fn load_comments(conn: &Connection, annotation_id: &str) -> Result<Vec<LocalComment>, String> {
    let mut stmt = conn
        .prepare("SELECT id, body, created_at FROM comments WHERE annotation_id = ? ORDER BY created_at ASC")
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map([annotation_id], |row| {
            Ok(LocalComment {
                id: row.get(0)?,
                body: row.get(1)?,
                created_at: row.get(2)?,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())
}

#[tauri::command]
fn list_annotations(app: AppHandle) -> Result<Vec<Annotation>, String> {
    let conn = connect(&app)?;
    let mut stmt = conn
        .prepare("SELECT * FROM annotations ORDER BY updated_at DESC")
        .map_err(|error| error.to_string())?;
    let ids = stmt
        .query_map([], |row| row.get::<_, String>("id"))
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    ids.into_iter()
        .map(|id| get_annotation(app.clone(), id).and_then(|item| item.ok_or_else(|| "Annotation not found".to_string())))
        .collect()
}

#[tauri::command]
fn get_annotation(app: AppHandle, id: String) -> Result<Option<Annotation>, String> {
    let conn = connect(&app)?;
    let comments = load_comments(&conn, &id)?;
    let mut stmt = conn
        .prepare("SELECT * FROM annotations WHERE id = ?")
        .map_err(|error| error.to_string())?;
    let result = stmt.query_row([id], |row| row_to_annotation(row, comments));
    match result {
        Ok(item) => Ok(Some(item)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn save_annotation(app: AppHandle, annotation: Annotation) -> Result<Annotation, String> {
    let conn = connect(&app)?;
    let now = Utc::now().to_rfc3339();
    let id = annotation.id.clone().unwrap_or_else(|| format!("local-{}", Uuid::new_v4()));
    let user_id = annotation.user_id.clone().unwrap_or_else(|| "local-user".to_string());
    let comments = annotation.comments.clone().unwrap_or_default();
    let tags = serde_json::to_string(&annotation.tags.clone().unwrap_or_default()).map_err(|error| error.to_string())?;
    let created_at = annotation.created_at.clone().unwrap_or_else(|| now.clone());
    let version = annotation.conflict_version.unwrap_or(1);

    conn.execute(
        r#"
        INSERT INTO users (id, username, display_name, synced_at, conflict_version)
        VALUES (?, ?, ?, ?, 1)
        ON CONFLICT(id) DO NOTHING
        "#,
        params![&user_id, "local", "Local User", &now],
    )
    .map_err(|error| error.to_string())?;

    conn.execute(
        r#"
        INSERT INTO annotations (
          id, user_id, source_url, source_type, source_title, source_domain, source_thumbnail,
          clip_text, clip_start_sec, clip_end_sec, clip_media_path, commentary, tags,
          is_public, synced_at, conflict_version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          source_url = excluded.source_url,
          source_type = excluded.source_type,
          source_title = excluded.source_title,
          source_domain = excluded.source_domain,
          source_thumbnail = excluded.source_thumbnail,
          clip_text = excluded.clip_text,
          clip_start_sec = excluded.clip_start_sec,
          clip_end_sec = excluded.clip_end_sec,
          clip_media_path = excluded.clip_media_path,
          commentary = excluded.commentary,
          tags = excluded.tags,
          is_public = excluded.is_public,
          synced_at = excluded.synced_at,
          conflict_version = annotations.conflict_version + 1,
          updated_at = excluded.updated_at
        "#,
        params![
            &id,
            &user_id,
            annotation.source_url,
            annotation.source_type,
            annotation.source_title,
            annotation.source_domain,
            annotation.source_thumbnail,
            annotation.clip_text,
            annotation.clip_start_sec,
            annotation.clip_end_sec,
            annotation.clip_media_path,
            annotation.commentary,
            tags,
            annotation.is_public.unwrap_or(0),
            annotation.synced_at,
            version,
            created_at,
            &now
        ],
    )
    .map_err(|error| error.to_string())?;

    conn.execute("DELETE FROM comments WHERE annotation_id = ?", [&id])
        .map_err(|error| error.to_string())?;
    for comment in comments {
        conn.execute(
            "INSERT INTO comments (id, annotation_id, user_id, parent_id, body, synced_at, conflict_version, created_at) VALUES (?, ?, ?, NULL, ?, ?, 1, ?)",
            params![
                comment.id,
                &id,
                &user_id,
                comment.body,
                &now,
                comment.created_at
            ],
        )
        .map_err(|error| error.to_string())?;
    }

    get_annotation(app, id)?.ok_or_else(|| "Saved annotation not found".to_string())
}

#[tauri::command]
fn delete_annotation(app: AppHandle, id: String) -> Result<bool, String> {
    let conn = connect(&app)?;
    conn.execute("DELETE FROM comments WHERE annotation_id = ?", [&id])
        .map_err(|error| error.to_string())?;
    conn.execute("DELETE FROM annotations WHERE id = ?", [&id])
        .map_err(|error| error.to_string())?;
    Ok(true)
}

#[tauri::command]
fn post_annotation(app: AppHandle, id: String) -> Result<Option<Annotation>, String> {
    let conn = connect(&app)?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE annotations SET is_public = 1, synced_at = ?, updated_at = ?, conflict_version = conflict_version + 1 WHERE id = ?",
        params![&now, &now, id],
    )
    .map_err(|error| error.to_string())?;
    get_annotation(app, id)
}

#[tauri::command]
fn load_settings(app: AppHandle) -> Result<Settings, String> {
    let conn = connect(&app)?;
    let path = db_path(&app)?.display().to_string();
    let default = Settings {
        api_endpoint: "http://localhost:3080".to_string(),
        hotkey: "CommandOrControl+Shift+A".to_string(),
        storage_location: path,
    };
    let value: Result<String, _> = conn.query_row("SELECT value FROM settings WHERE key = 'desktop'", [], |row| row.get(0));
    match value {
        Ok(json) => serde_json::from_str(&json).map_err(|error| error.to_string()),
        Err(_) => Ok(default),
    }
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: Settings) -> Result<Settings, String> {
    let conn = connect(&app)?;
    let json = serde_json::to_string(&settings).map_err(|error| error.to_string())?;
    conn.execute(
        "INSERT INTO settings (key, value) VALUES ('desktop', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [json],
    )
    .map_err(|error| error.to_string())?;
    Ok(settings)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let app_handle = app.handle().clone();
            let shortcut_str = "CmdOrControl+Shift+A";
            app.global_shortcut().on_shortcut(shortcut_str, move |_app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    let _ = app_handle.emit("shortcut:composer-toggle", true);
                }
            })?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_annotations,
            get_annotation,
            save_annotation,
            delete_annotation,
            post_annotation,
            load_settings,
            save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Annotated desktop app");
}

fn main() {
    run();
}
