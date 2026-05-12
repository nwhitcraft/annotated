const API_BASE = 'http://localhost:3080';
const WEB_BASE = 'http://localhost:3090';
const USER_ID = 'demo-user';

let currentPage = null;

const statusEl = document.getElementById('status');
const feedTitleEl = document.getElementById('feed-title');
const feedCountEl = document.getElementById('feed-count');
const feedListEl = document.getElementById('feed-list');

hydrate();
ensureUser();

feedListEl?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-comment-url]');
  if (!button) return;

  event.preventDefault();
  const url = button.getAttribute('data-comment-url');
  if (!url) return;

  chrome.windows.create({ url, type: 'normal', focused: true });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'PAGE_DETECTED' || msg.type === 'STATE_UPDATED') {
    renderState(msg.state);
  }

  if (msg.type === 'ANNOTATION_POSTED') {
    if (msg.state) renderState(msg.state);
    else loadFeed();
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
    // The API seeds this user at startup; sidebar creation should not block on it.
  }
}

function renderState(state) {
  if (!state) {
    loadFeed();
    return;
  }

  currentPage = state.page || currentPage;
  renderPageStatus();
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
      <p class="feed-commentary">${escapeHtml(item.commentary || '')}</p>
      ${item.clip_text ? `<blockquote class="feed-quote">${escapeHtml(truncate(item.clip_text, 180))}</blockquote>` : `<p class="feed-quote">${escapeHtml(mediaRange(item))}</p>`}
      <div class="feed-actions">
        <button class="feed-action" type="button" data-comment-url="${escapeAttr(annotationCommentsUrl(item))}" aria-label="Open comments">
          <span aria-hidden="true">○</span>
          <span>${Number(item.comment_count || 0)}</span>
          <span>Comment</span>
        </button>
      </div>
    </article>
  `).join('');
}

async function fetchJson(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(data.error || `Request failed: ${response.status}`);
  return data;
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

function annotationCommentsUrl(item) {
  return `${WEB_BASE}/a/${encodeURIComponent(item.id)}#comments`;
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
