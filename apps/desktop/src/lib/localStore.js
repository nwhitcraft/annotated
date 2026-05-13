import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';

const TOKEN_KEY = 'annotated.jwt';
const USER_ID_KEY = 'annotated.user_id';
const USERNAME_KEY = 'annotated.username';
const AVATAR_URL_KEY = 'annotated.avatar_url';
const DISPLAY_NAME_KEY = 'annotated.display_name';
const SUBSCRIPTION_TIER_KEY = 'annotated.subscription_tier';

export function getCurrentUserId() {
  return window.localStorage.getItem('annotated.user_id') || 'local-user';
}

const isTauri = Boolean(window.__TAURI_INTERNALS__);
const STORAGE_KEY = 'annotated.desktop.annotations';
const SETTINGS_KEY = 'annotated.desktop.settings';
let cachedSettings = null;

async function getApiEndpoint() {
  if (!cachedSettings) {
    cachedSettings = await loadSettings();
  }
  return cachedSettings?.apiEndpoint || 'http://localhost:3080';
}

async function apiEndpoint(settings = {}) {
  const endpoint = settings.apiEndpoint || await getApiEndpoint();
  return endpoint.replace(/\/$/, '');
}

async function apiRequest(path, options = {}, settings = {}) {
  const endpoint = await apiEndpoint(settings);
  const token = getToken();
  const headers = new Headers(options.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${endpoint}/api${path}`, {
    ...options,
    headers,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) throw new Error(data?.error || `Request failed: ${response.status}`);
  return data;
}

const demoAnnotations = [
  {
    id: 'local-briefing',
    user_id: 'local-user',
    source_url: 'https://www.ft.com/global-economy-resilience',
    source_type: 'article',
    source_title: 'Why the global economy keeps defying the pessimists',
    source_domain: 'ft.com',
    source_thumbnail: '',
    clip_text: 'The resilience of consumer spending and the adaptability of businesses have combined to produce outcomes many forecasters did not anticipate.',
    clip_start_sec: null,
    clip_end_sec: null,
    clip_media_path: null,
    commentary: 'Pessimism sells, but it is not a strategy. The real story is adaptation.',
    annotation_type: 'Analysis',
    tags: ['economy', 'briefing'],
    is_public: 0,
    synced_at: null,
    conflict_version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    comments: [
      {
        id: 'comment-1',
        body: 'This is exactly the kind of local note worth polishing before posting.',
        created_at: new Date().toISOString(),
      },
    ],
  },
];

const defaultSettings = {
  apiEndpoint: 'http://localhost:3080',
  frontendUrl: 'http://localhost:3090',
  hotkey: 'CommandOrControl+Shift+A',
  storageLocation: 'Application support / Annotated / annotated.sqlite',
};

export function getToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_ID_KEY);
  window.localStorage.removeItem(USERNAME_KEY);
  window.localStorage.removeItem(AVATAR_URL_KEY);
  window.localStorage.removeItem(DISPLAY_NAME_KEY);
  window.localStorage.removeItem(SUBSCRIPTION_TIER_KEY);
}

export function signOut() {
  clearToken();
}

export function getCachedUser() {
  const id = window.localStorage.getItem(USER_ID_KEY);
  if (!id) return null;
  return {
    id,
    username: window.localStorage.getItem(USERNAME_KEY) || '',
    display_name: window.localStorage.getItem(DISPLAY_NAME_KEY) || '',
    avatar_url: window.localStorage.getItem(AVATAR_URL_KEY) || '',
    subscription_tier: window.localStorage.getItem(SUBSCRIPTION_TIER_KEY) || 'free',
  };
}

function cacheUser(user) {
  if (!user?.id) return;
  window.localStorage.setItem(USER_ID_KEY, user.id);
  window.localStorage.setItem(USERNAME_KEY, user.username || '');
  window.localStorage.setItem(DISPLAY_NAME_KEY, user.display_name || user.username || '');
  if (user.avatar_url) window.localStorage.setItem(AVATAR_URL_KEY, user.avatar_url);
  else window.localStorage.removeItem(AVATAR_URL_KEY);
  window.localStorage.setItem(SUBSCRIPTION_TIER_KEY, user.subscription_tier || 'free');
}

export function authUrl(provider, settings = {}) {
  const endpoint = (settings.apiEndpoint || defaultSettings.apiEndpoint).replace(/\/$/, '');
  return `${endpoint}/api/auth/${provider}?client=desktop`;
}

export function setAuthTokenFromCallback(value) {
  const input = String(value || '').trim();
  if (!input) throw new Error('Paste a callback URL or token first.');
  let token = input;
  try {
    const url = new URL(input);
    token = url.searchParams.get('token') || url.searchParams.get('jwt') || input;
  } catch {
    // Plain token paste.
  }
  if (!token || token === input && input.includes('://')) throw new Error('No token found in callback URL.');
  setToken(token);
  return token;
}

export async function checkAuth(settings = {}) {
  const token = getToken();
  if (!token) return { user: null, error: 'unauthorized' };
  try {
    const data = await apiRequest('/auth/me', {}, settings);
    cacheUser(data);
    return { user: data };
  } catch (error) {
    clearToken();
    return { user: null, error: error.message || 'unauthorized' };
  }
}

export async function getFeed(tab = 'latest', settings = {}) {
  if (tab === 'following' && !getToken()) throw new Error('Sign in to see your following feed.');
  let path = '/feed';
  if (tab === 'trending') path = '/feed/trending';
  if (['article', 'youtube', 'podcast', 'twitter'].includes(tab)) path = `/feed?type=${tab}`;
  if (tab?.startsWith('tag:')) path = `/feed?annotation_type=${encodeURIComponent(tab.slice(4))}`;
  if (tab === 'following') path = `/feed/following/${encodeURIComponent(getCurrentUserId())}`;
  const data = await apiRequest(path, {}, settings);
  return data.items || data.annotations || data || [];
}

export async function getUser(usernameOrId, settings = {}) {
  return apiRequest(`/users/${encodeURIComponent(usernameOrId)}?viewer_id=${encodeURIComponent(getCurrentUserId())}`, {}, settings);
}

export async function getUserAnnotations(userId, tab = 'annotations', settings = {}) {
  const params = new URLSearchParams({ viewer_id: getCurrentUserId() });
  params.set('status', 'published');
  if (tab === 'liked') params.set('liked', '1');
  const data = await apiRequest(`/users/${encodeURIComponent(userId)}/annotations?${params}`, {}, settings);
  return data.items || data.annotations || [];
}

export async function toggleFollow(userId, settings = {}) {
  return apiRequest(`/users/${encodeURIComponent(userId)}/follow`, {
    method: 'POST',
    body: JSON.stringify({ user_id: getCurrentUserId() }),
  }, settings);
}

export async function toggleLike(annotationId, settings = {}) {
  return apiRequest(`/annotations/${encodeURIComponent(annotationId)}/like`, {
    method: 'POST',
    body: JSON.stringify({ user_id: getCurrentUserId() }),
  }, settings);
}

export async function toggleNoteworthy(annotationId, settings = {}) {
  return apiRequest(`/annotations/${encodeURIComponent(annotationId)}/noteworthy`, {
    method: 'POST',
    body: JSON.stringify({ user_id: getCurrentUserId() }),
  }, settings);
}

export async function updateProfile(userId, payload, settings = {}) {
  const data = await apiRequest(`/users/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }, settings);
  if (data.id === getCurrentUserId()) cacheUser(data);
  return data;
}

export async function uploadAvatar(file, userId = getCurrentUserId(), settings = {}) {
  const body = new FormData();
  body.append('avatar', file);
  if (userId) body.append('user_id', userId);
  const data = await apiRequest('/users/avatar', {
    method: 'POST',
    body,
  }, settings);
  if (data.avatar_url && userId === getCurrentUserId()) {
    const cached = getCachedUser();
    cacheUser({ ...cached, id: userId, avatar_url: data.avatar_url });
  }
  return data;
}

function readLocal() {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(demoAnnotations));
    return demoAnnotations;
  }
  return JSON.parse(raw);
}

function writeLocal(items) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  return items;
}

export async function listAnnotations() {
  if (isTauri) return invoke('list_annotations');
  return readLocal();
}

export async function getAnnotation(id) {
  if (isTauri) return invoke('get_annotation', { id });
  return readLocal().find((item) => item.id === id);
}

export async function saveAnnotation(annotation) {
  if (isTauri) return invoke('save_annotation', { annotation });
  const now = new Date().toISOString();
  const item = {
    ...annotation,
    id: annotation.id || `local-${crypto.randomUUID()}`,
    is_public: Number(annotation.is_public || 0),
    synced_at: annotation.synced_at || null,
    conflict_version: Number(annotation.conflict_version || 1),
    created_at: annotation.created_at || now,
    updated_at: now,
    comments: annotation.comments || [],
  };
  const existing = readLocal();
  const next = existing.some((row) => row.id === item.id)
    ? existing.map((row) => row.id === item.id ? item : row)
    : [item, ...existing];
  writeLocal(next);
  return item;
}

export async function deleteAnnotation(id) {
  if (isTauri) return invoke('delete_annotation', { id });
  writeLocal(readLocal().filter((item) => item.id !== id));
  return true;
}

export async function postAnnotation(id) {
  const annotation = await getAnnotation(id);
  if (!annotation) throw new Error('Annotation not found.');
  await syncAnnotation({ ...annotation, is_public: 1 });
  const now = new Date().toISOString();
  const updated = {
    ...annotation,
    is_public: 1,
    synced_at: now,
    updated_at: now,
    user_id: getCurrentUserId(),
  };
  return saveAnnotation(updated);
}

export function mediaSrc(path) {
  if (!path) return '';
  if (/^(https?:|asset:|blob:|data:)/i.test(path)) return path;
  if (isTauri) return convertFileSrc(path);
  return path;
}

export async function startScreenClip(options = {}) {
  if (!isTauri) throw new Error('Screen clipping requires the Annotated desktop app.');
  return invoke('start_screen_clip', { request: options });
}

export async function stopScreenClip() {
  if (!isTauri) throw new Error('Screen clipping requires the Annotated desktop app.');
  return invoke('stop_screen_clip');
}

export async function screenClipStatus() {
  if (!isTauri) return { active: false };
  return invoke('screen_clip_status');
}

export async function syncAnnotation(annotation) {
  const token = getToken();
  if (!token) throw new Error('Sign in before publishing to the public feed.');
  try {
    const endpoint = await getApiEndpoint();
    const userId = getCurrentUserId();
    const body = {
      user_id: userId,
      source_url: annotation.source_url,
      source_type: annotation.source_type,
      source_title: annotation.source_title,
      source_domain: annotation.source_domain,
      source_thumbnail: annotation.source_thumbnail || null,
      clip_text: annotation.clip_text || null,
      clip_start_sec: annotation.clip_start_sec || null,
      clip_end_sec: annotation.clip_end_sec || null,
      clip_media_path: annotation.clip_media_path && !isTauri ? annotation.clip_media_path : null,
      commentary: annotation.commentary,
      annotation_type: annotation.annotation_type || 'Opinion',
      is_public: annotation.is_public ? 1 : 0,
      status: 'published',
    };
    const response = await fetch(`${endpoint}/api/annotations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || `API sync failed: ${response.status}`);
    if (isTauri && annotation.clip_media_path && data.id) {
      const upload = await invoke('upload_clip_to_api', {
        endpoint,
        token,
        annotationId: data.id,
        path: annotation.clip_media_path,
        start: annotation.clip_start_sec || 0,
        end: annotation.clip_end_sec || 90,
        sourceType: annotation.source_type || 'screen',
      });
      if (!upload.ok) {
        let detail = upload.blocker || upload.stderr || upload.stdout || 'Clip upload failed';
        try {
          const parsed = JSON.parse(upload.stdout || '{}');
          detail = parsed.error || parsed.detail || detail;
        } catch {
          // Keep curl diagnostics when the body is not JSON.
        }
        throw new Error(detail);
      }
    }
    return { ...annotation, remote_id: data.id };
  } catch (err) {
    throw new Error(err.message || 'API sync failed');
  }
}

export async function addLocalComment(annotationId, body) {
  const annotation = await getAnnotation(annotationId);
  const comment = {
    id: `comment-${crypto.randomUUID()}`,
    body,
    created_at: new Date().toISOString(),
  };
  return saveAnnotation({
    ...annotation,
    comments: [...(annotation.comments || []), comment],
  });
}

export async function loadSettings() {
  if (isTauri) return invoke('load_settings');
  return { ...defaultSettings, ...JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || '{}') };
}

export async function saveSettings(settings) {
  cachedSettings = { ...defaultSettings, ...settings };
  if (isTauri) return invoke('save_settings', { settings });
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  return settings;
}

export async function runDesktopDiagnostics() {
  if (!isTauri) {
    return {
      youtube: { ok: false, blocker: 'Run inside Tauri to exercise yt-dlp.' },
      podcast: { ok: false, blocker: 'Run inside Tauri to exercise ffmpeg.' },
      whisper: { ok: false, blocker: 'Run inside Tauri to exercise Whisper.' },
      screen: { ok: false, blocker: 'Screen capture requires Tauri permissions.' },
      auth: { ok: true, stdout: 'Desktop callback token parser available; deep-link auto-open needs the Tauri deep-link plugin before packaged auth is seamless.' },
    };
  }
  const [screen, auth] = await Promise.all([
    invoke('screen_clip_diagnostic'),
    invoke('handle_auth_callback', { callbackUrl: 'annotated://callback?token=diagnostic' }).then(() => ({ ok: true, stdout: 'Callback parser ready; automatic URL handling still needs packaged deep-link registration.' })).catch((error) => ({ ok: false, blocker: String(error) })),
  ]);
  return {
    youtube: { ok: false, blocker: 'Provide a YouTube URL in a clipping workflow to run yt-dlp.' },
    podcast: { ok: false, blocker: 'Provide an audio URL/file in a clipping workflow to run ffmpeg.' },
    whisper: { ok: false, blocker: 'Provide an audio file and local whisper binary to transcribe.' },
    screen,
    auth,
  };
}

export async function exportAnnotation(annotation) {
  const text = [
    `# ${annotation.commentary}`,
    '',
    `Source: ${annotation.source_title}`,
    annotation.source_url,
    '',
    annotation.clip_text ? `> ${annotation.clip_text}` : '',
    '',
    `Tags: ${(annotation.tags || []).join(', ')}`,
  ].filter(Boolean).join('\n');
  if (isTauri) {
    try {
      await writeText(text);
    } catch {
      await navigator.clipboard?.writeText(text);
    }
  } else {
    await navigator.clipboard?.writeText(text);
  }
  return text;
}
