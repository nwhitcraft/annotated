import { invoke } from '@tauri-apps/api/core';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';

const isTauri = Boolean(window.__TAURI_INTERNALS__);
const STORAGE_KEY = 'annotated.desktop.annotations';
const SETTINGS_KEY = 'annotated.desktop.settings';

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

async function markAnnotationPosted(id) {
  if (isTauri) return invoke('post_annotation', { id });
  const now = new Date().toISOString();
  const next = readLocal().map((item) => item.id === id ? { ...item, is_public: 1, synced_at: now, updated_at: now } : item);
  writeLocal(next);
  return next.find((item) => item.id === id);
}

export async function syncAnnotation(annotation, settings = defaultSettings) {
  const endpoint = (settings.apiEndpoint || defaultSettings.apiEndpoint).replace(/\/$/, '');
  const apiBase = endpoint.endsWith('/api') ? endpoint : `${endpoint}/api`;
  const userResponse = await fetch(`${apiBase}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'local',
      display_name: 'Local User',
      provider: 'local',
      provider_id: annotation.user_id || 'local-user',
    }),
  });

  if (!userResponse.ok) {
    const message = await userResponse.text();
    throw new Error(message || `User sync failed with ${userResponse.status}`);
  }

  const user = await userResponse.json();
  const response = await fetch(`${apiBase}/annotations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: user.id || annotation.user_id || 'local-user',
      source_url: annotation.source_url,
      source_type: annotation.source_type,
      source_title: annotation.source_title,
      source_domain: annotation.source_domain,
      source_thumbnail: annotation.source_thumbnail || null,
      clip_text: annotation.clip_text || null,
      clip_start_sec: annotation.clip_start_sec || null,
      clip_end_sec: annotation.clip_end_sec || null,
      clip_media_path: annotation.clip_media_path || null,
      commentary: annotation.commentary,
      tags: annotation.tags || [],
      local_id: annotation.id,
      conflict_version: annotation.conflict_version || 1,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Sync failed with ${response.status}`);
  }

  const remote = await response.json();
  return saveAnnotation({
    ...annotation,
    ...remote,
    id: annotation.id,
    is_public: 1,
    synced_at: new Date().toISOString(),
  });
}

export async function postAnnotation(id, settings = defaultSettings) {
  const annotation = await getAnnotation(id);
  if (!annotation) return null;

  if (settings.apiEndpoint) {
    return syncAnnotation(annotation, settings);
  }

  return markAnnotationPosted(id);
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
  if (isTauri) await writeText(text);
  else await navigator.clipboard?.writeText(text);
  return text;
}
