import { invoke } from '@tauri-apps/api/core';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';

function getCurrentUserId() {
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
  hotkey: 'CommandOrControl+Shift+A',
  storageLocation: 'Application support / Annotated / annotated.sqlite',
};

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
  if (isTauri) {
    const local = await invoke('post_annotation', { id });
    await syncAnnotation(local);
    return local;
  }
  const now = new Date().toISOString();
  const next = readLocal().map((item) => item.id === id ? { ...item, is_public: 1, synced_at: now, updated_at: now } : item);
  writeLocal(next);
  return next.find((item) => item.id === id);
}

export async function syncAnnotation(annotation) {
  if (!isTauri) return annotation;
  try {
    const endpoint = await getApiEndpoint();
    const userId = getCurrentUserId();
    const tags = annotation.tags || [];
    const tagsJson = JSON.stringify(tags);
    const body = {
      user_id: annotation.user_id || userId,
      source_url: annotation.source_url,
      source_type: annotation.source_type,
      source_title: annotation.source_title,
      source_domain: annotation.source_domain,
      source_thumbnail: annotation.source_thumbnail || null,
      clip_text: annotation.clip_text || null,
      clip_start_sec: annotation.clip_start_sec || null,
      clip_end_sec: annotation.clip_end_sec || null,
      commentary: annotation.commentary,
      tags: tags,
      is_public: annotation.is_public ? 1 : 0,
    };
    const response = await fetch(`${endpoint}/api/annotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      console.warn('API sync failed:', response.status, await response.text());
    }
    return annotation;
  } catch (err) {
    console.warn('API sync error:', err.message);
    return annotation;
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
  if (isTauri) return invoke('save_settings', { settings });
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  return settings;
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
