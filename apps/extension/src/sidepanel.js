const API_BASE = 'http://localhost:3080';
const WEB_BASE = 'http://localhost:3090';
const ANNOTATION_TYPES = ['Opinion', 'Analysis', 'Fact Check', 'Context', 'Correction', 'Breaking'];

let currentPage = null;
let currentClip = null;
let authToken = '';
let currentUser = null;
let openClaimFor = null;

const authSlotEl = document.getElementById('auth-slot');
const statusEl = document.getElementById('status');
const composeEl = document.getElementById('compose');
const feedTitleEl = document.getElementById('feed-title');
const feedCountEl = document.getElementById('feed-count');
const feedListEl = document.getElementById('feed-list');

hydrate();

feedListEl?.addEventListener('click', (event) => {
  const commentButton = event.target.closest('[data-comment-url]');
  const claimButton = event.target.closest('[data-claim-id]');
  if (commentButton) {
    event.preventDefault();
    chrome.windows.create({ url: commentButton.getAttribute('data-comment-url'), type: 'normal', focused: true });
    return;
  }
  if (claimButton) {
    event.preventDefault();
    openClaimFor = openClaimFor === claimButton.getAttribute('data-claim-id') ? null : claimButton.getAttribute('data-claim-id');
    loadFeed();
  }
});

window.addEventListener('message', (event) => {
  if (event.origin !== WEB_BASE) return;
  if (event.data?.type !== 'ANNOTATED_AUTH_TOKEN' || !event.data.token) return;
  storeAuth(event.data.token, event.data.user || null);
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'PAGE_DETECTED' || msg.type === 'STATE_UPDATED') {
    renderState(msg.state);
  }

  if (msg.type === 'CLIP_TEXT') {
    renderState(msg.state);
  }

  if (msg.type === 'ANNOTATION_POSTED') {
    if (msg.state) renderState(msg.state);
    else loadFeed();
  }

  if (msg.type === 'AUTH_UPDATED') {
    loadAuth().then(() => {
      renderAuth();
      renderCompose();
      loadFeed();
    });
  }
});

async function hydrate() {
  await loadAuth();
  renderAuth();
  chrome.runtime.sendMessage({ type: 'GET_ACTIVE_STATE' }, (response) => {
    if (chrome.runtime.lastError) {
      renderState(null);
      return;
    }
    renderState(response?.state);
  });
}

async function loadAuth() {
  const response = await sendRuntime({ type: 'GET_AUTH_STATE' }).catch(() => null);
  authToken = response?.token || '';
  currentUser = response?.user || null;
  if (authToken && !currentUser) {
    try {
      currentUser = await fetchJson('/api/auth/me');
      await storeAuth(authToken, currentUser);
    } catch {
      currentUser = null;
    }
  }
}

async function storeAuth(token, user) {
  authToken = token;
  currentUser = user;
  await sendRuntime({ type: 'STORE_AUTH_TOKEN', token, user }).catch(() => null);
  renderAuth();
}

function renderAuth() {
  if (!authSlotEl) return;
  if (currentUser) {
    const avatar = currentUser.avatar_url
      ? `<img src="${escapeAttr(currentUser.avatar_url)}" alt="">`
      : escapeHtml((currentUser.username || 'A').slice(0, 1).toUpperCase());
    authSlotEl.innerHTML = `<a class="avatar-button" href="${WEB_BASE}/u/${encodeURIComponent(currentUser.username)}" target="_blank" title="Open profile">${avatar}</a>`;
    return;
  }
  authSlotEl.innerHTML = '<button class="auth-button" id="login-button" type="button">Log in</button>';
  document.getElementById('login-button')?.addEventListener('click', () => {
    window.open(`${WEB_BASE}/extension-auth`, 'annotated-auth', 'width=440,height=620');
  });
}

function renderState(state) {
  currentPage = state?.page || currentPage;
  currentClip = state?.clip || currentClip;
  renderPageStatus();
  renderCompose();
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

function renderCompose(message = '') {
  if (!composeEl) return;
  if (!currentPage && !currentClip) {
    composeEl.hidden = true;
    return;
  }

  const clip = currentClip || {};
  composeEl.hidden = false;
  composeEl.innerHTML = `
    <p class="compose-title">${authToken ? 'Compose annotation' : 'Log in to publish from the side panel'}</p>
    ${clip.text ? `<blockquote class="clip-preview">${escapeHtml(truncate(clip.text, 180))}</blockquote>` : `<p class="clip-preview">${escapeHtml(mediaRange(clip.sourceType ? clip : currentPage))}</p>`}
    <select id="annotation-type" aria-label="Annotation type">
      ${ANNOTATION_TYPES.map((type) => `<option value="${escapeAttr(type)}">${escapeHtml(type)}</option>`).join('')}
    </select>
    <textarea id="commentary" maxlength="280" placeholder="Write the take people should respond to..." ${authToken ? '' : 'disabled'}></textarea>
    <div class="compose-row">
      <span>${escapeHtml(message)}</span>
      <button id="post-button" type="button" ${authToken ? '' : 'disabled'}>Post</button>
    </div>
  `;
  document.getElementById('post-button')?.addEventListener('click', postAnnotation);
}

async function postAnnotation() {
  const commentary = document.getElementById('commentary')?.value.trim();
  const annotationType = document.getElementById('annotation-type')?.value || 'Opinion';
  if (!commentary || !authToken || !currentUser) return;

  const button = document.getElementById('post-button');
  button.disabled = true;
  button.textContent = 'Posting';

  try {
    const clip = currentClip || {};
    const page = currentPage || clip;
    const mediaClip = await maybeCreateMediaClip(clip);
    const response = await fetchJson('/api/annotations', {
      method: 'POST',
      body: JSON.stringify({
        user_id: currentUser.id,
        source_url: clip.url || page.url,
        source_title: mediaClip?.title || clip.title || page.title || '',
        source_type: clip.sourceType || page.sourceType || 'article',
        source_domain: clip.domain || page.domain || '',
        source_site_name: clip.siteName || page.siteName || null,
        source_author: clip.author || page.author || null,
        source_published_at: clip.publishedAt || page.publishedAt || null,
        source_thumbnail: mediaClip?.thumbnail || clip.thumbnail || page.thumbnail || null,
        clip_text: clip.text || null,
        clip_start_sec: mediaClip?.startSec ?? clip.clipStartSec ?? null,
        clip_end_sec: mediaClip?.endSec ?? clip.clipEndSec ?? null,
        clip_media_path: mediaClip?.mediaPath || null,
        commentary,
        annotation_type: annotationType,
      }),
    });
    renderCompose('Posted');
    chrome.runtime.sendMessage({ type: 'ANNOTATION_POSTED', page: currentPage }, () => {
      void chrome.runtime.lastError;
    });
    window.open(`${WEB_BASE}/a/${encodeURIComponent(response.id)}`, '_blank');
  } catch (error) {
    renderCompose(error.message || 'Post failed');
  }
}

async function loadFeed() {
  if (!feedListEl) return;
  feedListEl.innerHTML = '<p class="feed-empty">Loading...</p>';

  try {
    let title = 'Your feed';
    let items = [];
    const viewerId = currentUser?.id || 'demo-user';

    if (currentPage?.url) {
      const pageFeed = await fetchJson(`/api/feed/page?url=${encodeURIComponent(currentPage.url)}&viewer_id=${encodeURIComponent(viewerId)}&limit=50`);
      items = pageFeed.items || [];
      if (items.length) title = 'On this page';
    }

    if (!items.length && currentUser?.id) {
      const following = await fetchJson(`/api/feed/following/${encodeURIComponent(currentUser.id)}?limit=50`);
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

  feedListEl.innerHTML = items.map(renderRelatedItem).join('');
  for (const form of feedListEl.querySelectorAll('[data-claim-form]')) {
    form.addEventListener('submit', submitClaim);
  }
}

function renderRelatedItem(item) {
  const claimForm = openClaimFor === item.id ? `
    <form class="claim-form" data-claim-form="${escapeAttr(item.id)}">
      <input name="email" type="email" placeholder="Email address" required>
      <textarea name="reason" placeholder="Describe the claim" required></textarea>
      <button type="submit">File claim</button>
    </form>
  ` : '';

  return `
    <article class="feed-item">
      <div class="feed-byline">
        <span>${escapeHtml(item.display_name || item.username || 'Anonymous')}</span>
        <span>${escapeHtml(sourceDate(item.source_published_at || item.created_at))}</span>
        <span>${escapeHtml(item.annotation_type || 'Opinion')}</span>
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
        <span>N ${Number(item.noteworthy_count || 0)}</span>
        <button class="feed-action" type="button" data-claim-id="${escapeAttr(item.id)}">
          <span>! ${Number(item.claim_count || 0)}</span>
          <span>Claim</span>
        </button>
      </div>
      ${claimForm}
    </article>
  `;
}

async function submitClaim(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const annotationId = form.getAttribute('data-claim-form');
  const body = {
    annotation_id: annotationId,
    claimant_email: form.elements.email.value,
    reason: form.elements.reason.value,
  };
  await fetchJson('/api/claims', { method: 'POST', body: JSON.stringify(body) });
  openClaimFor = null;
  loadFeed();
}

async function maybeCreateMediaClip(clip) {
  const type = clip?.sourceType;
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
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`);
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
  if (type === 'twitter') return 'X post';
  return 'Article';
}

function mediaRange(item) {
  if (item.clip_start_sec == null && item.clipStartSec == null) return `${typeLabel(item.source_type || item.sourceType)} excerpt`;
  const start = item.clip_start_sec ?? item.clipStartSec;
  const end = item.clip_end_sec ?? item.clipEndSec;
  return `${typeLabel(item.source_type || item.sourceType)} excerpt / ${formatTime(start)}-${formatTime(end)}`;
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

function sendRuntime(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) reject(error);
      else resolve(response);
    });
  });
}
