use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::menu::MenuBuilder;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State};
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
    annotation_type: Option<String>,
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
    #[serde(rename = "frontendUrl", default = "default_frontend_url")]
    frontend_url: String,
    #[serde(rename = "storageLocation")]
    storage_location: String,
}

fn default_frontend_url() -> String {
    option_env!("VITE_FRONTEND_URL")
        .unwrap_or("http://localhost:3090")
        .trim_end_matches('/')
        .to_string()
}

fn default_api_endpoint() -> String {
    option_env!("VITE_API_URL")
        .or(option_env!("VITE_API_BASE_URL"))
        .unwrap_or("http://localhost:3080")
        .trim_end_matches('/')
        .to_string()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ToolResult {
    ok: bool,
    status: Option<i32>,
    stdout: String,
    stderr: String,
    output_path: Option<String>,
    blocker: Option<String>,
}

#[derive(Default)]
struct ScreenCaptureState {
    session: Option<ScreenCaptureSession>,
}

struct ScreenCaptureSession {
    child: Child,
    output_path: String,
    started_at: Instant,
    started_at_iso: String,
    duration_seconds: u64,
    microphone: bool,
    system_audio: bool,
}

type SharedScreenCaptureState = Arc<Mutex<ScreenCaptureState>>;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StartScreenClipRequest {
    duration_seconds: Option<u64>,
    microphone: Option<bool>,
    system_audio: Option<bool>,
    display_index: Option<usize>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ScreenCaptureStatus {
    active: bool,
    output_path: Option<String>,
    started_at: Option<String>,
    elapsed_seconds: u64,
    duration_seconds: u64,
    microphone: bool,
    system_audio: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CaptureHelperPayload {
    ok: bool,
    output_path: Option<String>,
    duration: Option<f64>,
    microphone: Option<bool>,
    system_audio: Option<bool>,
    error: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ScreenClipResult {
    ok: bool,
    output_path: Option<String>,
    media_path: Option<String>,
    duration_seconds: u64,
    microphone: bool,
    system_audio: bool,
    error: Option<String>,
    stdout: String,
    stderr: String,
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
          annotation_type TEXT DEFAULT 'Opinion',
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

        "#,
    )
    .map_err(|error| error.to_string())?;
    for statement in [
        "ALTER TABLE annotations ADD COLUMN source_thumbnail TEXT",
        "ALTER TABLE annotations ADD COLUMN clip_text TEXT",
        "ALTER TABLE annotations ADD COLUMN clip_start_sec INTEGER",
        "ALTER TABLE annotations ADD COLUMN clip_end_sec INTEGER",
        "ALTER TABLE annotations ADD COLUMN clip_media_path TEXT",
        "ALTER TABLE annotations ADD COLUMN annotation_type TEXT DEFAULT 'Opinion'",
        "ALTER TABLE comments ADD COLUMN parent_id TEXT REFERENCES comments(id)",
        "ALTER TABLE comments ADD COLUMN synced_at TEXT",
        "ALTER TABLE comments ADD COLUMN conflict_version INTEGER NOT NULL DEFAULT 1",
    ] {
        let _ = conn.execute(statement, []);
    }
    let _ = conn.execute(
        "UPDATE annotations SET annotation_type = 'Opinion' WHERE annotation_type IS NULL",
        [],
    );
    conn.execute_batch(
        r#"
        CREATE INDEX IF NOT EXISTS idx_annotations_public ON annotations(is_public);
        CREATE INDEX IF NOT EXISTS idx_annotations_type ON annotations(annotation_type);
        CREATE INDEX IF NOT EXISTS idx_annotations_synced ON annotations(synced_at);
        CREATE INDEX IF NOT EXISTS idx_comments_annotation ON comments(annotation_id);
        CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);
        "#,
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn row_to_annotation(
    row: &rusqlite::Row<'_>,
    comments: Vec<LocalComment>,
) -> rusqlite::Result<Annotation> {
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
        annotation_type: row.get("annotation_type")?,
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
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
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
        .map(|id| {
            get_annotation(app.clone(), id)
                .and_then(|item| item.ok_or_else(|| "Annotation not found".to_string()))
        })
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
    let id = annotation
        .id
        .clone()
        .unwrap_or_else(|| format!("local-{}", Uuid::new_v4()));
    let user_id = annotation
        .user_id
        .clone()
        .unwrap_or_else(|| "local-user".to_string());
    let fallback_username = if user_id == "local-user" {
        "local".to_string()
    } else {
        user_id.clone()
    };
    let comments = annotation.comments.clone().unwrap_or_default();
    let tags = serde_json::to_string(&annotation.tags.clone().unwrap_or_default())
        .map_err(|error| error.to_string())?;
    let created_at = annotation.created_at.clone().unwrap_or_else(|| now.clone());
    let version = annotation.conflict_version.unwrap_or(1);

    conn.execute(
        r#"
        INSERT INTO users (id, username, display_name, synced_at, conflict_version)
        VALUES (?, ?, ?, ?, 1)
        ON CONFLICT(id) DO NOTHING
        "#,
        params![&user_id, fallback_username, "Local User", &now],
    )
    .map_err(|error| error.to_string())?;

    conn.execute(
        r#"
        INSERT INTO annotations (
          id, user_id, source_url, source_type, source_title, source_domain, source_thumbnail,
          clip_text, clip_start_sec, clip_end_sec, clip_media_path, commentary, annotation_type, tags,
          is_public, synced_at, conflict_version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          annotation_type = excluded.annotation_type,
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
            annotation.annotation_type.unwrap_or_else(|| "Opinion".to_string()),
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
        api_endpoint: default_api_endpoint(),
        frontend_url: default_frontend_url(),
        storage_location: path,
    };
    let value: Result<String, _> = conn.query_row(
        "SELECT value FROM settings WHERE key = 'desktop'",
        [],
        |row| row.get(0),
    );
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

fn run_tool(mut command: Command, output_path: Option<String>) -> ToolResult {
    match command.output() {
        Ok(output) => ToolResult {
            ok: output.status.success(),
            status: output.status.code(),
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            output_path,
            blocker: if output.status.success() {
                None
            } else {
                Some("tool exited with a non-zero status".to_string())
            },
        },
        Err(error) => ToolResult {
            ok: false,
            status: None,
            stdout: String::new(),
            stderr: String::new(),
            output_path,
            blocker: Some(error.to_string()),
        },
    }
}

fn output_file_is_valid(path: &PathBuf) -> bool {
    fs::metadata(path)
        .map(|metadata| metadata.len() > 1024)
        .unwrap_or(false)
}

fn remove_partial_output(path: &PathBuf) {
    if path.exists() {
        let _ = fs::remove_file(path);
    }
}

fn format_media_timestamp(seconds: i64) -> String {
    let safe = seconds.max(0);
    let hours = safe / 3600;
    let minutes = (safe % 3600) / 60;
    let secs = safe % 60;
    format!("{:02}:{:02}:{:02}", hours, minutes, secs)
}

fn first_http_line(value: &str) -> Option<String> {
    value
        .lines()
        .map(|line| line.trim())
        .find(|line| line.starts_with("http://") || line.starts_with("https://"))
        .map(|line| line.to_string())
}

fn resolve_podcast_audio_url(input: &str) -> Option<String> {
    let output = Command::new("yt-dlp")
        .arg("--ignore-config")
        .arg("-f")
        .arg("bestaudio/best")
        .arg("-g")
        .arg("--no-playlist")
        .arg("--no-warnings")
        .arg(input)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    first_http_line(&String::from_utf8_lossy(&output.stdout))
}

fn tool_failure_summary(method: &str, result: &ToolResult) -> String {
    let detail = if !result.stderr.trim().is_empty() {
        result.stderr.trim()
    } else if !result.stdout.trim().is_empty() {
        result.stdout.trim()
    } else {
        result.blocker.as_deref().unwrap_or("tool failed")
    };
    format!(
        "{}: {}",
        method,
        detail.lines().next().unwrap_or("tool failed")
    )
}

fn media_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("media");
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

fn compile_capture_helper(source: PathBuf, helper: PathBuf) -> Result<(), String> {
    if !source.exists() {
        return Err(format!(
            "Native capture source not found at {}",
            source.display()
        ));
    }
    if let Some(parent) = helper.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let info_plist = source
        .parent()
        .and_then(|native_dir| native_dir.parent())
        .map(|manifest_dir| manifest_dir.join("Info.plist"));
    let mut args = vec![
        "swiftc".to_string(),
        "-O".to_string(),
        "-parse-as-library".to_string(),
        "-framework".to_string(),
        "ScreenCaptureKit".to_string(),
        "-framework".to_string(),
        "AVFoundation".to_string(),
        "-framework".to_string(),
        "CoreMedia".to_string(),
        "-framework".to_string(),
        "CoreGraphics".to_string(),
        "-framework".to_string(),
        "CoreVideo".to_string(),
        "-o".to_string(),
        helper.to_string_lossy().to_string(),
    ];
    if let Some(path) = info_plist.filter(|path| path.exists()) {
        args.extend([
            "-Xlinker".to_string(),
            "-sectcreate".to_string(),
            "-Xlinker".to_string(),
            "__TEXT".to_string(),
            "-Xlinker".to_string(),
            "__info_plist".to_string(),
            "-Xlinker".to_string(),
            path.to_string_lossy().to_string(),
        ]);
    }
    args.push(source.to_string_lossy().to_string());
    let output = Command::new("xcrun")
        .args(args)
        .output()
        .map_err(|error| format!("Could not run Swift compiler: {}", error))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

fn capture_helper_path(app: &AppHandle) -> Result<PathBuf, String> {
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        return Err("Screen capture is only implemented for macOS in this build.".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        if let Some(sidecar_name) = option_env!("ANNOTATED_CAPTURE_SIDECAR") {
            let mut candidates = Vec::new();
            let names = [sidecar_name, "annotated-capture"];
            if let Ok(resource_dir) = app.path().resource_dir() {
                for name in names {
                    candidates.push(resource_dir.join(name));
                }
                if let Some(contents_dir) = resource_dir.parent() {
                    for name in names {
                        candidates.push(contents_dir.join("MacOS").join(name));
                    }
                }
            }
            if let Ok(exe) = std::env::current_exe() {
                if let Some(exe_dir) = exe.parent() {
                    for name in names {
                        candidates.push(exe_dir.join(name));
                    }
                }
            }
            if let Some(path) = candidates.into_iter().find(|path| path.exists()) {
                return Ok(path);
            }
        }

        if let Some(path) = option_env!("ANNOTATED_CAPTURE_HELPER") {
            let compiled = PathBuf::from(path);
            if compiled.exists() {
                return Ok(compiled);
            }
        }

        let helper = app
            .path()
            .app_data_dir()
            .map_err(|error| error.to_string())?
            .join("native")
            .join("annotated-capture");
        if helper.exists() {
            return Ok(helper);
        }

        let source = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("native")
            .join("AnnotatedCapture.swift");
        compile_capture_helper(source, helper.clone())?;
        Ok(helper)
    }
}

fn capture_status_from_session(session: &ScreenCaptureSession) -> ScreenCaptureStatus {
    ScreenCaptureStatus {
        active: true,
        output_path: Some(session.output_path.clone()),
        started_at: Some(session.started_at_iso.clone()),
        elapsed_seconds: session.started_at.elapsed().as_secs(),
        duration_seconds: session.duration_seconds,
        microphone: session.microphone,
        system_audio: session.system_audio,
    }
}

fn parse_helper_payload(stdout: &str) -> Option<CaptureHelperPayload> {
    stdout
        .lines()
        .rev()
        .map(str::trim)
        .find(|line| line.starts_with('{') && line.ends_with('}'))
        .and_then(|line| serde_json::from_str(line).ok())
}

fn empty_screen_capture_status() -> ScreenCaptureStatus {
    ScreenCaptureStatus {
        active: false,
        output_path: None,
        started_at: None,
        elapsed_seconds: 0,
        duration_seconds: 90,
        microphone: false,
        system_audio: false,
    }
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn set_tray_recording(app: &AppHandle, recording: bool) {
    if let Some(tray) = app.tray_by_id("annotated-tray") {
        let _ = tray.set_title(Some(if recording { "●" } else { "an" }));
        let _ = tray.set_tooltip(Some(if recording {
            "Annotated is clipping"
        } else {
            "Annotated"
        }));
    }
}

#[tauri::command]
fn start_screen_clip(
    app: AppHandle,
    state: State<SharedScreenCaptureState>,
    request: StartScreenClipRequest,
) -> Result<ScreenCaptureStatus, String> {
    let mut guard = state.lock().map_err(|error| error.to_string())?;
    if let Some(session) = guard.session.as_ref() {
        return Ok(capture_status_from_session(session));
    }

    let duration = request.duration_seconds.unwrap_or(90).clamp(1, 90);
    let microphone = request.microphone.unwrap_or(true);
    let system_audio = request.system_audio.unwrap_or(true);
    let output = media_dir(&app)?.join(format!("screen-{}.mp4", Uuid::new_v4()));
    let helper = capture_helper_path(&app)?;

    let mut command = Command::new(helper);
    command
        .arg("--output")
        .arg(&output)
        .arg("--duration")
        .arg(duration.to_string())
        .arg("--microphone")
        .arg(if microphone { "true" } else { "false" })
        .arg("--system-audio")
        .arg(if system_audio { "true" } else { "false" })
        .arg("--display-index")
        .arg(request.display_index.unwrap_or(0).to_string())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command.spawn().map_err(|error| error.to_string())?;
    thread::sleep(Duration::from_millis(350));
    if child
        .try_wait()
        .map_err(|error| error.to_string())?
        .is_some()
    {
        let output = child
            .wait_with_output()
            .map_err(|error| error.to_string())?;
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let payload = parse_helper_payload(&stdout);
        let detail = payload
            .and_then(|item| item.error)
            .or_else(|| {
                if stderr.trim().is_empty() {
                    None
                } else {
                    Some(stderr)
                }
            })
            .unwrap_or_else(|| "Screen capture stopped before it could begin.".to_string());
        return Err(detail);
    }
    let status = ScreenCaptureStatus {
        active: true,
        output_path: Some(output.to_string_lossy().to_string()),
        started_at: Some(Utc::now().to_rfc3339()),
        elapsed_seconds: 0,
        duration_seconds: duration,
        microphone,
        system_audio,
    };

    guard.session = Some(ScreenCaptureSession {
        child,
        output_path: output.to_string_lossy().to_string(),
        started_at: Instant::now(),
        started_at_iso: status.started_at.clone().unwrap_or_default(),
        duration_seconds: duration,
        microphone,
        system_audio,
    });
    drop(guard);

    set_tray_recording(&app, true);
    let _ = app.emit("screen-capture-started", status.clone());
    Ok(status)
}

#[tauri::command]
fn stop_screen_clip(
    app: AppHandle,
    state: State<SharedScreenCaptureState>,
) -> Result<ScreenClipResult, String> {
    let mut guard = state.lock().map_err(|error| error.to_string())?;
    let session = guard
        .session
        .take()
        .ok_or_else(|| "No active screen capture.".to_string())?;
    drop(guard);

    #[cfg(unix)]
    unsafe {
        let _ = libc::kill(session.child.id() as i32, libc::SIGINT);
    }

    let fallback_output = session.output_path.clone();
    let elapsed = session
        .started_at
        .elapsed()
        .as_secs()
        .clamp(1, session.duration_seconds);
    let microphone = session.microphone;
    let system_audio = session.system_audio;
    let output = session
        .child
        .wait_with_output()
        .map_err(|error| error.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let payload = parse_helper_payload(&stdout);
    let output_path = payload
        .as_ref()
        .and_then(|item| item.output_path.clone())
        .unwrap_or(fallback_output);
    let exists = fs::metadata(&output_path)
        .map(|metadata| metadata.len() > 0)
        .unwrap_or(false);
    let helper_error = payload.as_ref().and_then(|item| item.error.clone());
    let ok =
        output.status.success() && payload.as_ref().map(|item| item.ok).unwrap_or(exists) && exists;
    let duration_seconds = payload
        .as_ref()
        .and_then(|item| item.duration)
        .map(|value| value.round().max(1.0) as u64)
        .unwrap_or(elapsed);

    let result = ScreenClipResult {
        ok,
        output_path: if exists {
            Some(output_path.clone())
        } else {
            None
        },
        media_path: if exists { Some(output_path) } else { None },
        duration_seconds,
        microphone: payload
            .as_ref()
            .and_then(|item| item.microphone)
            .unwrap_or(microphone),
        system_audio: payload
            .as_ref()
            .and_then(|item| item.system_audio)
            .unwrap_or(system_audio),
        error: if ok {
            None
        } else {
            helper_error
                .or_else(|| Some("Screen capture did not produce a playable file.".to_string()))
        },
        stdout,
        stderr,
    };

    set_tray_recording(&app, false);
    let _ = app.emit("screen-capture-stopped", result.clone());
    Ok(result)
}

#[tauri::command]
fn screen_clip_status(state: State<SharedScreenCaptureState>) -> ScreenCaptureStatus {
    let Ok(guard) = state.lock() else {
        return empty_screen_capture_status();
    };
    guard
        .session
        .as_ref()
        .map(capture_status_from_session)
        .unwrap_or_else(empty_screen_capture_status)
}

#[tauri::command]
fn upload_clip_to_api(
    endpoint: String,
    token: String,
    annotation_id: String,
    path: String,
    start: Option<i64>,
    end: Option<i64>,
    source_type: Option<String>,
) -> Result<ToolResult, String> {
    if token.trim().is_empty() {
        return Err("Sign in before uploading a public clip.".to_string());
    }
    let url = format!(
        "{}/api/annotations/{}/clip-upload",
        endpoint.trim_end_matches('/'),
        annotation_id
    );
    let mut command = Command::new("curl");
    command
        .arg("-sS")
        .arg("-X")
        .arg("POST")
        .arg("-H")
        .arg(format!("Authorization: Bearer {}", token))
        .arg("-F")
        .arg(format!("clip=@{}", path))
        .arg("-F")
        .arg(format!("start={}", start.unwrap_or(0)))
        .arg("-F")
        .arg(format!("end={}", end.unwrap_or(90)))
        .arg("-F")
        .arg(format!(
            "source_type={}",
            source_type.unwrap_or_else(|| "screen".to_string())
        ))
        .arg(url);
    Ok(run_tool(command, None))
}

#[tauri::command]
fn clip_youtube(app: AppHandle, url: String, start: i64, end: i64) -> Result<ToolResult, String> {
    let media_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("media");
    fs::create_dir_all(&media_dir).map_err(|error| error.to_string())?;
    let duration = (end - start).clamp(1, 90);
    let output = media_dir.join(format!("youtube-{}.mp4", Uuid::new_v4()));
    let mut command = Command::new("yt-dlp");
    command
        .arg("--download-sections")
        .arg(format!("*{}-{}", start, start + duration))
        .arg("-f")
        .arg("mp4[height<=240]/mp4")
        .arg("-o")
        .arg(output.to_string_lossy().to_string())
        .arg(url);
    Ok(run_tool(
        command,
        Some(output.to_string_lossy().to_string()),
    ))
}

#[tauri::command]
fn extract_podcast_audio(
    app: AppHandle,
    input: String,
    start: i64,
    end: i64,
) -> Result<ToolResult, String> {
    let media_dir = media_dir(&app)?;
    let duration = (end - start).clamp(1, 90);
    let output = media_dir.join(format!("podcast-{}.mp3", Uuid::new_v4()));
    let output_string = output.to_string_lossy().to_string();
    let mut attempts: Vec<(String, String)> = Vec::new();

    if let Some(resolved_url) = resolve_podcast_audio_url(&input) {
        attempts.push(("yt-dlp direct audio".to_string(), resolved_url));
    }
    attempts.push(("original URL/file".to_string(), input.clone()));

    let mut failures: Vec<String> = Vec::new();
    for (method, source) in attempts {
        remove_partial_output(&output);
        let mut command = Command::new("ffmpeg");
        command
            .arg("-hide_banner")
            .arg("-loglevel")
            .arg("error")
            .arg("-nostdin")
            .arg("-y")
            .arg("-ss")
            .arg(start.to_string())
            .arg("-i")
            .arg(source)
            .arg("-t")
            .arg(duration.to_string())
            .arg("-vn")
            .arg("-map")
            .arg("0:a:0")
            .arg("-c:a")
            .arg("libmp3lame")
            .arg("-q:a")
            .arg("4")
            .arg(&output_string);
        let result = run_tool(command, Some(output_string.clone()));
        if result.ok && output_file_is_valid(&output) {
            return Ok(result);
        }
        failures.push(tool_failure_summary(&method, &result));
    }

    remove_partial_output(&output);
    let start_ts = format_media_timestamp(start);
    let end_ts = format_media_timestamp(start + duration);
    let mut command = Command::new("yt-dlp");
    command
        .arg("--ignore-config")
        .arg("-f")
        .arg("bestaudio/best")
        .arg("-x")
        .arg("--audio-format")
        .arg("mp3")
        .arg("--audio-quality")
        .arg("4")
        .arg("--download-sections")
        .arg(format!("*{}-{}", start_ts, end_ts))
        .arg("-o")
        .arg(&output_string)
        .arg("--force-overwrite")
        .arg("--no-playlist")
        .arg("--no-warnings")
        .arg(input);
    let result = run_tool(command, Some(output_string.clone()));
    if result.ok && output_file_is_valid(&output) {
        return Ok(result);
    }
    failures.push(tool_failure_summary("yt-dlp section download", &result));
    remove_partial_output(&output);

    Ok(ToolResult {
        ok: false,
        status: result.status,
        stdout: result.stdout,
        stderr: failures.join("\n"),
        output_path: Some(output_string),
        blocker: Some("Failed to extract podcast audio clip".to_string()),
    })
}

#[tauri::command]
fn transcribe_with_whisper(input: String) -> Result<ToolResult, String> {
    let mut command = Command::new("whisper");
    command.arg(input).arg("--output_format").arg("txt");
    Ok(run_tool(command, None))
}

#[tauri::command]
fn screen_clip_diagnostic(app: AppHandle) -> ToolResult {
    match capture_helper_path(&app) {
        Ok(helper) => {
            let mut command = Command::new(helper);
            command.arg("--preflight");
            let mut result = run_tool(command, None);
            if result.ok {
                result.blocker = None;
            }
            result
        }
        Err(error) => ToolResult {
            ok: false,
            status: None,
            stdout: String::new(),
            stderr: String::new(),
            output_path: None,
            blocker: Some(error),
        },
    }
}

#[tauri::command]
fn handle_auth_callback(callback_url: String) -> Result<String, String> {
    if !callback_url.starts_with("annotated://callback") {
        return Err("unsupported callback scheme".to_string());
    }
    Ok(callback_url)
}

#[tauri::command]
fn open_auth_url(url: String) -> Result<(), String> {
    let target = url.trim();
    if !(target.starts_with("http://") || target.starts_with("https://")) {
        return Err("unsupported auth URL".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        let chrome = Command::new("open")
            .arg("-a")
            .arg("Google Chrome")
            .arg(target)
            .status();
        if matches!(chrome, Ok(status) if status.success()) {
            return Ok(());
        }

        let fallback = Command::new("open")
            .arg(target)
            .status()
            .map_err(|error| format!("Could not open browser: {}", error))?;
        return if fallback.success() {
            Ok(())
        } else {
            Err("Could not open browser sign-in.".to_string())
        };
    }

    #[cfg(target_os = "windows")]
    {
        let status = Command::new("cmd")
            .args(["/C", "start", "", target])
            .status()
            .map_err(|error| format!("Could not open browser: {}", error))?;
        return if status.success() {
            Ok(())
        } else {
            Err("Could not open browser sign-in.".to_string())
        };
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let status = Command::new("xdg-open")
            .arg(target)
            .status()
            .map_err(|error| format!("Could not open browser: {}", error))?;
        return if status.success() {
            Ok(())
        } else {
            Err("Could not open browser sign-in.".to_string())
        };
    }
}

pub fn run() {
    tauri::Builder::default()
        .manage(Arc::new(Mutex::new(ScreenCaptureState::default())) as SharedScreenCaptureState)
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let clip_handle = app.handle().clone();
            let clip_shortcut_str = "Alt+Shift+X";
            app.global_shortcut().on_shortcut(
                clip_shortcut_str,
                move |_app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        let _ = clip_handle.emit("tray-start-screen-clip", true);
                    }
                },
            )?;
            let menu = MenuBuilder::new(app)
                .text("toggle_window", "Show Annotated")
                .text("quick_clip", "Start 90s Screen Clip")
                .text("stop_clip", "Stop Screen Clip")
                .separator()
                .quit_with_text("Quit Annotated")
                .build()?;
            TrayIconBuilder::with_id("annotated-tray")
                .title("an")
                .tooltip("Annotated")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "toggle_window" => show_main_window(app),
                    "quick_clip" => {
                        let _ = app.emit("tray-start-screen-clip", true);
                    }
                    "stop_clip" => {
                        let _ = app.emit("tray-stop-screen-clip", true);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;
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
            clip_youtube,
            extract_podcast_audio,
            transcribe_with_whisper,
            screen_clip_diagnostic,
            start_screen_clip,
            stop_screen_clip,
            screen_clip_status,
            upload_clip_to_api,
            handle_auth_callback,
            open_auth_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Annotated desktop app");
}

fn main() {
    run();
}
