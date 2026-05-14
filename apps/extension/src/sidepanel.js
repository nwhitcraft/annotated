const API_BASE = 'https://annotated-nwhitcraft.fly.dev';
const WEB_BASE = 'https://annotated-nwhitcraft.fly.dev';

let currentPage = null;
let authToken = '';
let authUser = null;
let loadingFeed = false;
let pendingPageUrl = '';
let feedRequestId = 0;

const statusEl = document.getElementById('status');
const feedTitleEl = document.getElementById('feed-title');
const feedCountEl = document.getElementById('feed-count');
const feedListEl = document.getElementById('feed-list');
const onboardingBannerEl = document.getElementById('onboarding-banner');

hydrate();
loadAuth().then(() => ensureUser());

window.addEventListener('focus', refreshFeedIfVisible);
document.addEventListener('visibilitychange', refreshFeedIfVisible);
window.setInterval(refreshFeedIfVisible, 5000);

feedListEl?.addEventListener('click', (event) => {
  const actionButton = event.target.closest('[data-feed-action]');
  if (actionButton) {
    void handleFeedAction(event, actionButton);
    return;
  }

  const cancelButton = event.target.closest('[data-report-cancel]');
  if (cancelButton) {
    event.preventDefault();
    cancelButton.closest('[data-report-form]')?.remove();
    return;
  }
});

feedListEl?.addEventListener('submit', (event) => {
  const form = event.target.closest('[data-report-form]');
  if (!form) return;
  event.preventDefault();
  void submitReportForm(form);
});

document.addEventListener('click', (event) => {
  const editButton = event.target.closest('[data-auth-edit]');
  if (editButton) {
    event.preventDefault();
    showProfileEditor();
    return;
  }

  const cancelButton = event.target.closest('[data-auth-edit-cancel]');
  if (cancelButton) {
    event.preventDefault();
    closeProfileEditor();
  }
});

document.addEventListener('submit', (event) => {
  if (event.target?.id !== 'auth-profile-editor') return;
  event.preventDefault();
  saveProfileFromSidebar(event.target);
});

chrome.runtime.onMessage.addListener((msg) => {
  if (['PAGE_DETECTED', 'STATE_UPDATED', 'ACTIVE_TAB_CHANGED', 'TAB_NAVIGATED', 'CLIP_TEXT'].includes(msg.type)) {
    renderState(msg.state);
  }

  if (msg.type === 'ANNOTATION_POSTED') {
    if (msg.state) renderState(msg.state);
    else loadFeed();
  }

  if (msg.type === 'AUTH_UPDATED') {
    loadAuth().then(() => {
      renderAuthSlot();
      renderOnboardingBanner();
      loadFeed();
    });
  }
});

function hydrate() {
  chrome.runtime.sendMessage({ type: 'GET_ACTIVE_STATE' }, (response) => {
    if (chrome.runtime.lastError) return;
    renderState(response?.state);
  });
}

async function loadAuth() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_AUTH_STATE' }, (response) => {
      if (chrome.runtime.lastError) {
        resolve();
        return;
      }
      authToken = response?.token || '';
      authUser = response?.user || null;
      refreshAuthUser().finally(resolve);
    });
  });
}

async function refreshAuthUser() {
  if (!authUser?.id) return;
  try {
    const headers = new Headers();
    if (authToken) headers.set('Authorization', `Bearer ${authToken}`);
    const response = await fetch(`${API_BASE}/api/users/${encodeURIComponent(authUser.id)}`, { headers });
    const fresh = await response.json().catch(() => ({}));
    if (!response.ok || fresh.error) throw new Error(fresh.error || 'Profile refresh failed');
    authUser = { ...authUser, ...fresh };
  } catch {
    // Keep the cached auth user if the profile refresh fails.
  }
}

function renderAuthSlot() {
  const slot = document.getElementById('auth-slot');
  if (!slot) return;
  if (authUser) {
    const label = authUser.display_name || authUser.username || 'You';
    const profileHref = authUser.username
      ? `${WEB_BASE}/u/${encodeURIComponent(authUser.username)}?edit=1`
      : `${WEB_BASE}/feed`;
    slot.innerHTML = `
      <a class="auth-profile" href="${escapeAttr(profileHref)}" target="_blank" rel="noreferrer">
        <span class="auth-avatar">${authUser.avatar_url ? `<img src="${escapeAttr(authUser.avatar_url)}" alt="">` : escapeHtml(initials(label))}</span>
        <span class="auth-user">${escapeHtml(label)}</span>
      </a>
      <button class="auth-edit" type="button" data-auth-edit>Edit</button>
    `;
  } else {
    slot.innerHTML = `<a href="${escapeAttr(WEB_BASE)}/extension-auth" target="_blank" class="auth-signin">Sign in</a>`;
  }
  renderOnboardingBanner();
}

function renderOnboardingBanner() {
  if (!onboardingBannerEl) return;
  const needsOnboarding = authUser?.id && !Boolean(Number(authUser.onboarding_completed));
  onboardingBannerEl.hidden = !needsOnboarding;
  if (!needsOnboarding) {
    onboardingBannerEl.innerHTML = '';
    return;
  }

  onboardingBannerEl.innerHTML = `
    <strong>Complete your profile setup</strong>
    <span>Your account is connected. Finish onboarding before your profile goes live.</span>
    <a href="${escapeAttr(WEB_BASE)}/onboarding" target="_blank" rel="noreferrer">Open onboarding</a>
  `;
}

function showProfileEditor() {
  if (!authUser?.id) return;
  closeProfileEditor();
  const header = document.querySelector('.topline');
  if (!header) return;
  const webProfileHref = authUser.username
    ? `${WEB_BASE}/u/${encodeURIComponent(authUser.username)}?edit=1`
    : `${WEB_BASE}/feed`;
  header.insertAdjacentHTML('afterend', `
    <form id="auth-profile-editor" class="auth-editor">
      <label>
        <span>Display name</span>
        <input name="display_name" required value="${escapeAttr(authUser.display_name || authUser.username || '')}">
      </label>
      <label>
        <span>Bio</span>
        <textarea name="bio" maxlength="280">${escapeHtml(authUser.bio || '')}</textarea>
      </label>
      <label>
        <span>Avatar URL</span>
        <input name="avatar_url" type="url" value="${escapeAttr(authUser.avatar_url || '')}">
      </label>
      <label>
        <span>Link</span>
        <input name="link" type="url" value="${escapeAttr(authUser.link || '')}">
      </label>
      <label>
        <span>X handle</span>
        <input name="twitter_handle" value="${escapeAttr(authUser.twitter_handle || '')}">
      </label>
      <p class="auth-editor-error" hidden></p>
      <div class="auth-editor-actions">
        <button type="submit">Save</button>
        <button type="button" data-auth-edit-cancel>Cancel</button>
        <a href="${escapeAttr(webProfileHref)}" target="_blank" rel="noreferrer">Open web</a>
      </div>
    </form>
  `);
}

function closeProfileEditor() {
  document.getElementById('auth-profile-editor')?.remove();
}

async function saveProfileFromSidebar(form) {
  if (!authUser?.id) return;
  const button = form.querySelector('button[type="submit"]');
  const errorEl = form.querySelector('.auth-editor-error');
  button.disabled = true;
  button.textContent = 'Saving';
  errorEl.hidden = true;

  try {
    const payload = {
      display_name: form.elements.display_name.value,
      bio: form.elements.bio.value,
      avatar_url: form.elements.avatar_url.value,
      link: form.elements.link.value,
      twitter_handle: form.elements.twitter_handle.value.replace(/^@+/, ''),
    };
    const updated = await fetchJson(`/api/users/${encodeURIComponent(authUser.id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    authUser = { ...authUser, ...updated };
    if (authToken) {
      chrome.runtime.sendMessage({ type: 'STORE_AUTH_TOKEN', token: authToken, user: authUser }, () => {
        void chrome.runtime.lastError;
      });
    }
    renderAuthSlot();
    closeProfileEditor();
  } catch (error) {
    errorEl.hidden = false;
    errorEl.textContent = error.message || 'Could not save profile';
  } finally {
    button.disabled = false;
    button.textContent = 'Save';
  }
}

async function ensureUser() {
  renderAuthSlot();
  if (authUser?.id) return;
  try {
    await fetch(`${API_BASE}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'demo',
        display_name: 'Demo User',
        provider: 'local',
        provider_id: 'demo-user',
      }),
    });
  } catch {
    // fallback demo user
  }
}

function renderState(state) {
  if (!state) {
    loadFeed();
    return;
  }

  if (Object.prototype.hasOwnProperty.call(state, 'page')) currentPage = state.page || null;
  pendingPageUrl = currentPage ? '' : state.pendingUrl || '';
  renderPageStatus();
  if (pendingPageUrl && !currentPage) {
    renderPendingPage();
    return;
  }
  loadFeed();
}

function renderPageStatus() {
  if (!currentPage) {
    statusEl.hidden = !pendingPageUrl;
    if (pendingPageUrl) {
      statusEl.innerHTML = `
        <span class="status-dot article"></span>
        <span class="status-source">loading</span>
        <span class="status-title">${escapeHtml(hostnameFromUrl(pendingPageUrl) || 'Current page')}</span>
      `;
    }
    return;
  }

  statusEl.hidden = false;
  statusEl.innerHTML = `
    <span class="status-dot ${escapeHtml(currentPage.sourceType || 'article')}"></span>
    <span class="status-source">${escapeHtml(currentPage.sourceType || 'article')}</span>
    <span class="status-title">${escapeHtml(sourceLabel(currentPage))}</span>
  `;
}

function renderPendingPage() {
  feedTitleEl.textContent = 'Current page';
  feedCountEl.textContent = '';
  feedListEl.innerHTML = '<p class="feed-empty">Loading this page...</p>';
}

function refreshFeedIfVisible() {
  if (document.visibilityState === 'hidden') return;
  hydrate();
}

async function loadFeed(options = {}) {
  if (!feedListEl) return;
  const requestId = feedRequestId + 1;
  feedRequestId = requestId;
  loadingFeed = true;
  const page = currentPage ? { ...currentPage } : null;
  const pageKey = pageIdentity(page);
  const showLoading = options.showLoading !== false;
  if (showLoading) feedListEl.innerHTML = '<p class="feed-empty">Loading...</p>';

  try {
    if (isAnnotatedPage(page)) {
      if (!isLatestFeedRequest(requestId, pageKey)) return;
      renderAnnotatedPageState();
      return;
    }

    let title = 'Your feed';
    let items = [];

    if (page?.url) {
      const viewerId = authUser?.id || 'demo-user';
      const pageFeed = await fetchJson(`/api/feed/page?url=${encodeURIComponent(page.url)}&viewer_id=${encodeURIComponent(viewerId)}&limit=50`);
      items = pageFeed.items || [];
      if (items.length) title = 'On this page';
    }

    if (!items.length) {
      const following = authUser?.id ? await fetchJson(`/api/feed/following/${encodeURIComponent(authUser.id)}?limit=50`) : { items: [] };
      items = following.items || [];
      title = items.length ? 'Following' : 'Latest';
    }

    if (!items.length) {
      const latest = await fetchJson('/api/feed?limit=50');
      items = latest.items || [];
      title = 'Latest';
    }

    if (!isLatestFeedRequest(requestId, pageKey)) return;
    renderFeed(title, items.slice(0, 50));
  } catch {
    if (showLoading && isLatestFeedRequest(requestId, pageKey)) renderFeed('Feed', []);
  } finally {
    if (requestId === feedRequestId) loadingFeed = false;
  }
}

function pageIdentity(page) {
  return page?.url || page?.pageUrl || '';
}

function isLatestFeedRequest(requestId, pageKey) {
  return requestId === feedRequestId && pageKey === pageIdentity(currentPage);
}

function renderAnnotatedPageState() {
  feedTitleEl.textContent = 'Annotated';
  feedCountEl.textContent = '';
  feedListEl.innerHTML = `
    <p class="feed-empty">
      Annotated is already open in this tab. Use the web app here; the side panel will stay out of the way.
    </p>
  `;
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
        <span>${escapeHtml(annotatedAt(item.created_at))}</span>
        ${item.followed_by_viewer ? '<span>Following</span>' : ''}
      </div>
      <a class="source-line" href="${escapeAttr(annotationCommentsUrl(item))}" target="_blank" rel="noreferrer">
        ${escapeHtml(sourceLabel(item))}
      </a>
      <p class="feed-commentary">${escapeHtml(item.commentary || '')}</p>
      ${clipPreview(item)}
      <div class="feed-actions">
        <button class="feed-action feed-action-credible" type="button" data-feed-action="credible" data-annotation-id="${escapeAttr(item.id)}" aria-label="Mark credible">
          <span aria-hidden="true">✓</span>
          <span>Credible</span>
          <span data-action-count>${Number(item.like_count || 0)}</span>
        </button>
        <button class="feed-action feed-action-disagree" type="button" data-feed-action="disagree" data-annotation-id="${escapeAttr(item.id)}" aria-label="Disagree">
          <span aria-hidden="true">×</span>
          <span>Disagree</span>
          <span data-action-count>${Number(item.noteworthy_count || 0)}</span>
        </button>
        <button class="feed-action" type="button" data-feed-action="comments" data-comment-url="${escapeAttr(annotationCommentsUrl(item))}" aria-label="Open comments">
          <span aria-hidden="true">○</span>
          <span>Comments</span>
          <span data-action-count>${Number(item.comment_count || 0)}</span>
        </button>
        <button class="feed-action feed-action-report" type="button" data-feed-action="report" data-annotation-id="${escapeAttr(item.id)}" aria-label="Report annotation">
          <span aria-hidden="true">◇</span>
          <span>Reports</span>
          <span data-action-count>${Number(item.claim_count || 0)}</span>
        </button>
      </div>
    </article>
  `).join('');
}

async function handleFeedAction(event, button) {
  event.preventDefault();
  const action = button.getAttribute('data-feed-action');
  const annotationId = button.getAttribute('data-annotation-id');

  if (action === 'comments') {
    const url = button.getAttribute('data-comment-url');
    if (url) chrome.windows.create({ url, type: 'normal', focused: true });
    return;
  }

  if (action === 'report') {
    toggleReportForm(button.closest('.feed-item'), annotationId);
    return;
  }

  if (!annotationId || !['credible', 'disagree'].includes(action)) return;

  const endpoint = action === 'credible' ? 'like' : 'noteworthy';
  const stateKey = action === 'credible' ? 'liked' : 'noteworthy';
  const countEl = button.querySelector('[data-action-count]');
  const wasActive = button.classList.contains('is-active');
  const nextActive = !wasActive;
  button.classList.toggle('is-active', nextActive);
  updateCount(countEl, nextActive ? 1 : -1);
  button.disabled = true;

  try {
    const data = await fetchJson(`/api/annotations/${encodeURIComponent(annotationId)}/${endpoint}`, {
      method: 'POST',
      body: JSON.stringify({ user_id: currentActorId() }),
    });
    if (typeof data[stateKey] === 'boolean' && data[stateKey] !== nextActive) {
      button.classList.toggle('is-active', data[stateKey]);
      updateCount(countEl, data[stateKey] ? 1 : -1);
    }
  } catch {
    button.classList.toggle('is-active', wasActive);
    updateCount(countEl, nextActive ? -1 : 1);
  } finally {
    button.disabled = false;
  }
}

function toggleReportForm(article, annotationId) {
  if (!article || !annotationId) return;
  const existing = article.querySelector('[data-report-form]');
  if (existing) {
    existing.remove();
    return;
  }

  article.insertAdjacentHTML('beforeend', `
    <form class="feed-report-form" data-report-form data-annotation-id="${escapeAttr(annotationId)}">
      <strong>File a report</strong>
      <textarea name="description" required placeholder="Describe the issue"></textarea>
      <p class="feed-report-error" hidden></p>
      <div class="feed-report-actions">
        <button type="submit">Submit</button>
        <button type="button" data-report-cancel>Cancel</button>
      </div>
    </form>
  `);
}

async function submitReportForm(form) {
  const annotationId = form.getAttribute('data-annotation-id');
  const description = form.elements.description?.value?.trim();
  const submit = form.querySelector('button[type="submit"]');
  const error = form.querySelector('.feed-report-error');
  if (!annotationId || !description || !submit) return;

  submit.disabled = true;
  submit.textContent = 'Submitting';
  if (error) error.hidden = true;

  try {
    await fetchJson('/api/claims', {
      method: 'POST',
      body: JSON.stringify({
        annotation_id: annotationId,
        reason_code: 'other',
        description,
      }),
    });
    const reportButton = form.closest('.feed-item')?.querySelector('[data-feed-action="report"] [data-action-count]');
    updateCount(reportButton, 1);
    form.innerHTML = '<p class="feed-report-confirmation">Report filed. We will review it shortly.</p>';
  } catch (err) {
    if (error) {
      error.hidden = false;
      error.textContent = err.message || 'Could not file report';
    }
  } finally {
    if (form.isConnected) {
      submit.disabled = false;
      submit.textContent = 'Submit';
    }
  }
}

function currentActorId() {
  return authUser?.id || authUser?.username || 'demo-user';
}

function updateCount(el, delta) {
  if (!el) return;
  const next = Math.max(0, Number(el.textContent || 0) + delta);
  el.textContent = String(next);
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
  if (type === 'video') return 'Video';
  if (type === 'podcast') return 'Audio';
  return 'Article';
}

function clipPreview(item) {
  if (item.clip_text) return `<blockquote class="feed-quote">${escapeHtml(truncate(item.clip_text, 180))}</blockquote>`;
  const attachment = item.clip_media_path
    ? ` / <a href="${escapeAttr(`${API_BASE}${item.clip_media_path}`)}" target="_blank" rel="noreferrer">Clip attached</a>`
    : '';
  return `<p class="feed-quote">${escapeHtml(mediaRange(item))}${attachment}</p>`;
}

function mediaRange(item) {
  if (item.clip_start_sec == null || item.clip_end_sec == null) return `${typeLabel(item.source_type)} excerpt`;
  return `${typeLabel(item.source_type)} excerpt / ${formatTime(item.clip_start_sec)}-${formatTime(item.clip_end_sec)}`;
}

function annotationCommentsUrl(item) {
  return `${WEB_BASE}/a/${encodeURIComponent(item.id)}#comments`;
}

function isAnnotatedPage(page) {
  return [page?.url, page?.pageUrl].filter(Boolean).some(isAnnotatedUrl);
}

function isAnnotatedUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^www\./, '');
    return url.origin === WEB_BASE
      || hostname === 'annotated.com'
      || ((hostname === 'localhost' || hostname === '127.0.0.1') && url.port === '3090');
  } catch {
    return false;
  }
}

function hostnameFromUrl(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function annotatedAt(value) {
  if (!value) return '';
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function parseDate(value) {
  const normalized = String(value || '').trim().replace(' ', 'T');
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  return new Date(hasZone ? normalized : `${normalized}Z`);
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

function initials(value) {
  return String(value || 'You')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'Y';
}
