const API_BASE = 'http://localhost:3080';
const USER_ID = 'demo-user';
const SHORTCUT_KEY = 'annotated.shortcut';
const DEFAULT_SHORTCUT = /Mac|iPhone|iPad/i.test(navigator.platform) ? 'Command+Shift+X' : 'Ctrl+Shift+X';

let currentClip = null;
let currentPage = null;
let shortcutCapture = false;

const statusEl = document.getElementById('status');
const clipEl = document.getElementById('clip');
const emptyEl = document.getElementById('empty');
const composeEl = document.getElementById('compose');
const commentaryEl = document.getElementById('commentary');
const postBtn = document.getElementById('post-btn');
const metaEl = document.getElementById('clip-meta');
const clipModeBtn = document.getElementById('clip-mode-btn');
const shortcutBtn = document.getElementById('shortcut-btn');
const shortcutLabelEl = document.getElementById('shortcut-label');
const emptyShortcutEl = document.getElementById('empty-shortcut');
const feedTitleEl = document.getElementById('feed-title');
const feedCountEl = document.getElementById('feed-count');
const feedListEl = document.getElementById('feed-list');

hydrate();
ensureUser();
initShortcut();

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'PAGE_DETECTED' || msg.type === 'CLIP_TEXT' || msg.type === 'STATE_UPDATED') {
    renderState(msg.state);
  }
});

clipModeBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'START_CLIPPING_ACTIVE_TAB' });
});

shortcutBtn.addEventListener('click', () => {
  shortcutCapture = true;
  shortcutBtn.textContent = 'Press keys';
});

document.addEventListener('keydown', (event) => {
  if (!shortcutCapture) return;

  event.preventDefault();
  event.stopPropagation();

  if (event.key === 'Escape') {
    shortcutCapture = false;
    shortcutBtn.textContent = 'Change';
    return;
  }

  const next = shortcutFromEvent(event);
  if (!next) {
    shortcutBtn.textContent = 'Use modifier';
    window.setTimeout(() => {
      if (shortcutCapture) shortcutBtn.textContent = 'Press keys';
    }, 1000);
    return;
  }

  chrome.storage.sync.set({ [SHORTCUT_KEY]: next }, () => {
    shortcutCapture = false;
    shortcutBtn.textContent = 'Change';
    renderShortcut(next);
  });
}, true);

commentaryEl.addEventListener('input', updatePostState);

postBtn.addEventListener('click', async () => {
  if (!currentClip || !commentaryEl.value.trim()) return;

  postBtn.disabled = true;
  postBtn.textContent = 'Posting...';

  try {
    await ensureUser();
    const mediaClip = await maybeCreateMediaClip(currentClip);
    const res = await fetch(`${API_BASE}/api/annotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: USER_ID,
        source_url: currentClip.url,
        source_title: mediaClip?.title || currentClip.title || currentPage?.title || '',
        source_type: currentPage?.sourceType || currentClip.sourceType || 'article',
        source_domain: currentPage?.domain || currentClip.domain || '',
        source_site_name: currentPage?.siteName || currentClip.siteName || null,
        source_author: currentPage?.author || currentClip.author || null,
        source_published_at: currentPage?.publishedAt || currentClip.publishedAt || null,
        source_thumbnail: mediaClip?.thumbnail || currentPage?.thumbnail || currentClip.thumbnail || null,
        clip_text: currentClip.text || null,
        clip_start_sec: mediaClip?.startSec ?? currentClip.clipStartSec ?? null,
        clip_end_sec: mediaClip?.endSec ?? currentClip.clipEndSec ?? null,
        clip_media_path: mediaClip?.mediaPath || null,
        commentary: commentaryEl.value.trim(),
      }),
    });

    const data = await res.json();
    if (!data.id) throw new Error(data.error || 'Post failed');

    postBtn.textContent = 'Posted';
    commentaryEl.value = '';
    currentClip = null;
    renderComposer();
    await loadFeed();

    window.setTimeout(() => {
      postBtn.textContent = 'Post annotation';
      updatePostState();
    }, 1200);
  } catch (err) {
    postBtn.textContent = 'Error - try again';
    window.setTimeout(() => {
      postBtn.textContent = 'Post annotation';
      updatePostState();
    }, 1800);
  }
});

function hydrate() {
  chrome.runtime.sendMessage({ type: 'GET_ACTIVE_STATE' }, (response) => {
    if (chrome.runtime.lastError) return;
    renderState(response?.state);
  });
}

async function ensureUser() {
  try {
    await fetch(`${API_BASE}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'demo',
        display_name: 'Demo User',
        provider: 'local',
        provider_id: USER_ID,
      }),
    });
  } catch {
    // The API also seeds this user at startup. This is just a belt-and-braces path.
  }
}

function initShortcut() {
  chrome.storage.sync.get({ [SHORTCUT_KEY]: DEFAULT_SHORTCUT }, (items) => {
    if (chrome.runtime.lastError) {
      renderShortcut(DEFAULT_SHORTCUT);
      return;
    }
    const shortcut = items[SHORTCUT_KEY] || DEFAULT_SHORTCUT;
    renderShortcut(shortcut);
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes[SHORTCUT_KEY]) renderShortcut(changes[SHORTCUT_KEY].newValue || DEFAULT_SHORTCUT);
  });
}

function renderShortcut(shortcut) {
  const label = normalizeShortcut(shortcut);
  shortcutLabelEl.textContent = label;
  emptyShortcutEl.textContent = label;
}

function shortcutFromEvent(event) {
  if (!event.metaKey && !event.ctrlKey && !event.altKey) return '';

  const key = normalizeKey(event.key);
  if (!key || ['Shift', 'Ctrl', 'Control', 'Alt', 'Option', 'Command', 'Meta', 'Cmd'].includes(key)) return '';

  const parts = [];
  if (event.metaKey) parts.push('Command');
  if (event.ctrlKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  parts.push(key);
  return parts.join('+');
}

function renderState(state) {
  if (!state) return;
  currentPage = state.page || currentPage;
  currentClip = state.clip || currentClip;

  renderPageStatus();
  renderComposer();
  loadFeed();
}

function renderPageStatus() {
  if (!currentPage) return;

  statusEl.hidden = false;
  statusEl.innerHTML = `
    <span class="status-dot ${escapeHtml(currentPage.sourceType || 'article')}"></span>
    <span class="status-source">${escapeHtml(currentPage.sourceType || 'article')}</span>
    <span class="status-title">${escapeHtml(sourceLabel(currentPage))}</span>
  `;
}

function renderComposer() {
  const hasClip = Boolean(currentClip);
  emptyEl.hidden = hasClip;
  clipEl.hidden = !hasClip;
  metaEl.hidden = !hasClip;
  composeEl.hidden = !hasClip;

  if (hasClip) {
    clipEl.textContent = currentClip.text || `${typeLabel(currentClip.sourceType)} excerpt`;
    metaEl.textContent = clipMeta(currentClip, currentPage);
  }

  updatePostState();
}

async function loadFeed() {
  if (!feedListEl) return;
  feedListEl.innerHTML = '<p class="feed-empty">Loading...</p>';

  try {
    let title = 'Your feed';
    let items = [];

    if (currentPage?.url) {
      const pageFeed = await fetchJson(`/api/feed/page?url=${encodeURIComponent(currentPage.url)}&viewer_id=${USER_ID}&limit=50`);
      items = pageFeed.items || [];
      if (items.length) title = 'On this page';
    }

    if (!items.length) {
      const following = await fetchJson(`/api/feed/following/${encodeURIComponent(USER_ID)}?limit=50`);
      items = following.items || [];
      title = items.length ? 'Following' : 'Latest';
    }

    if (!items.length) {
      const latest = await fetchJson('/api/feed?limit=50');
      items = latest.items || [];
      title = 'Latest';
    }

    renderFeed(title, items.slice(0, 50));
  } catch {
    renderFeed('Feed', []);
  }
}

function renderFeed(title, items) {
  feedTitleEl.textContent = title;
  feedCountEl.textContent = items.length ? `${items.length}` : '';

  if (!items.length) {
    feedListEl.innerHTML = '<p class="feed-empty">No annotations yet.</p>';
    return;
  }

  feedListEl.innerHTML = items.map((item) => `
    <article class="feed-item">
      <div class="feed-byline">
        <span>${escapeHtml(item.display_name || item.username || 'Anonymous')}</span>
        <span>${escapeHtml(sourceDate(item.source_published_at || item.created_at))}</span>
        ${item.followed_by_viewer ? '<span>Following</span>' : ''}
      </div>
      <a class="source-line" href="${escapeAttr(item.source_url)}" target="_blank" rel="noreferrer">
        ${escapeHtml(sourceLabel(item))}
      </a>
      ${item.clip_text ? `<blockquote class="feed-quote">${escapeHtml(truncate(item.clip_text, 180))}</blockquote>` : `<p class="feed-quote">${escapeHtml(mediaRange(item))}</p>`}
      <p class="feed-commentary">${escapeHtml(item.commentary || '')}</p>
    </article>
  `).join('');
}

async function maybeCreateMediaClip(clip) {
  const type = currentPage?.sourceType || clip.sourceType;
  if (!['youtube', 'podcast'].includes(type) || clip.clipStartSec == null || clip.clipEndSec == null) return null;

  try {
    return await fetchJson(`/api/clip/${type}`, {
      method: 'POST',
      body: JSON.stringify({
        url: clip.pageUrl || clip.url,
        start: clip.clipStartSec,
        end: clip.clipEndSec,
      }),
    });
  } catch {
    return null;
  }
}

async function fetchJson(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(data.error || `Request failed: ${response.status}`);
  return data;
}

function updatePostState() {
  postBtn.disabled = !currentClip || !commentaryEl.value.trim();
}

function clipMeta(clip, page) {
  const parts = [
    sourceLabel(page || clip),
    clip.author || page?.author,
  ].filter(Boolean);

  if (clip.clipStartSec != null && clip.clipEndSec != null) {
    parts.push(`${formatTime(clip.clipStartSec)}-${formatTime(clip.clipEndSec)}`);
  }
  return parts.join(' / ');
}

function sourceLabel(source) {
  if (!source) return '';
  const title = source.source_title || source.title || '';
  const site = source.source_site_name || source.siteName || source.source_domain || source.domain || '';
  return [title, site].filter(Boolean).join(' / ');
}

function typeLabel(type) {
  if (type === 'youtube') return 'Video';
  if (type === 'podcast') return 'Audio';
  return 'Article';
}

function mediaRange(item) {
  if (item.clip_start_sec == null || item.clip_end_sec == null) return `${typeLabel(item.source_type)} excerpt`;
  return `${typeLabel(item.source_type)} excerpt / ${formatTime(item.clip_start_sec)}-${formatTime(item.clip_end_sec)}`;
}

function sourceDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? `${str.slice(0, max)}...` : str;
}

function formatTime(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(value / 60);
  const secs = Math.floor(value % 60);
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('`', '&#096;');
}

function normalizeShortcut(value) {
  return String(value || DEFAULT_SHORTCUT)
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (['cmd', 'command', 'meta'].includes(lower)) return 'Command';
      if (['ctrl', 'control'].includes(lower)) return 'Ctrl';
      if (['alt', 'option'].includes(lower)) return 'Alt';
      if (lower === 'shift') return 'Shift';
      return normalizeKey(part);
    })
    .join('+');
}

function normalizeKey(value) {
  const key = String(value || '').trim();
  if (key.length === 1) return key.toUpperCase();
  return key.replace(/^Arrow/, '');
}
