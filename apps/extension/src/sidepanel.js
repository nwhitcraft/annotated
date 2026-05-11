const API_BASE = 'http://localhost:3080';
const WEB_BASE = 'http://localhost:3090';
const STORAGE_KEY = 'annotated-following';
const AUTH_TOKEN_KEY = 'annotated.jwt';
const USER_ID_KEY = 'annotated.user_id';

let currentUser = null; // { id, username, token }

// ── Auth UI elements ─────────────────────────────────────────
const authBtn = document.getElementById('auth-btn');
const authStatusEl = document.getElementById('auth-status');
const avatarImg = document.getElementById('avatar-img');
const avatarPlaceholder = document.getElementById('avatar-placeholder');

// ── Auth helpers ───────────────────────────────────────────────

/**
 * Try to read auth from the web app's localStorage.
 * Works when extension and web app share the same origin (localhost).
 * For production, this will use postMessage from a hidden iframe.
 */
function readWebAuth() {
  try {
    // Same-origin: can read localStorage directly
    const token = window.localStorage.getItem(AUTH_TOKEN_KEY);
    const userId = window.localStorage.getItem(USER_ID_KEY);
    const username = window.localStorage.getItem('annotated.username');
    const avatarUrl = window.localStorage.getItem('annotated.avatar_url');
    if (token && userId) {
      return { token, userId, username, avatarUrl };
    }
  } catch (err) {
    // Cross-origin or localStorage blocked — fall through
    console.warn('Could not read web auth:', err);
  }
  return null;
}

/**
 * Open the web login page in a new tab.
 * After login, the web app stores JWT + user_id in localStorage.
 * We poll for the auth state change.
 */
function openLogin() {
  // Open the web app's login page
  const loginUrl = `${WEB_BASE}/login`;
  chrome.tabs.create({ url: loginUrl, active: true });

  // Poll for auth state change (user just logged in)
  let checks = 0;
  const pollInterval = setInterval(() => {
    checks++;
    const auth = readWebAuth();
    if (auth) {
      clearInterval(pollInterval);
      setAuthenticatedUser(auth);
    } else if (checks > 60) {
      // 60 * 500ms = 30s timeout — stop polling
      clearInterval(pollInterval);
    }
  }, 500);
}

/**
 * Set the authenticated user state and update UI.
 */
function setAuthenticatedUser(auth) {
  currentUser = {
    id: auth.userId,
    token: auth.token,
    username: auth.username || null,
    avatarUrl: auth.avatarUrl || null,
  };
  updateAuthUI();
  // Reload feeds with real user
  if (currentUrl) loadRelatedAnnotations(currentUrl);
  loadFollowingFeed();
}

/**
 * Update the auth button/status UI based on current state.
 */
function updateAuthUI() {
  if (currentUser) {
    // Hide sign-in button, show avatar
    authBtn.style.display = 'none';
    avatarImg.style.display = 'none';
    avatarPlaceholder.style.display = 'none';

    // Try to show avatar image from web app
    if (currentUser.avatarUrl) {
      avatarImg.src = currentUser.avatarUrl;
      avatarImg.style.display = 'block';
    } else {
      // Fallback: initials placeholder
      const initials = (currentUser.username || currentUser.id).slice(0, 2).toUpperCase();
      avatarPlaceholder.textContent = initials;
      avatarPlaceholder.style.display = 'flex';
    }

    // Click avatar → open profile page
    avatarImg.onclick = () => openProfile();
    avatarPlaceholder.onclick = () => openProfile();

    // Status bar with username + logout
    authStatusEl.style.display = 'flex';
    authStatusEl.innerHTML = `
      <span class="username">${escapeHtml(currentUser.username || currentUser.id.slice(0, 12))}</span>
      <span class="logout" onclick="logout()">sign out</span>
    `;
  } else {
    // Show sign-in button, hide avatar
    authBtn.style.display = 'block';
    authBtn.textContent = 'Sign In';
    authBtn.title = 'Sign in to post annotations';
    authBtn.onclick = openLogin;

    avatarImg.style.display = 'none';
    avatarPlaceholder.style.display = 'none';
    authStatusEl.style.display = 'none';
  }
}

/**
 * Open the user's profile page in a new browser tab.
 */
function openProfile() {
  if (!currentUser) return;
  const profileUrl = `${WEB_BASE}/u/${encodeURIComponent(currentUser.username || currentUser.id)}`;
  chrome.tabs.create({ url: profileUrl, active: true });
}

/**
 * Clear auth state and reset to demo mode.
 */
function logout() {
  currentUser = null;
  // Clear web app auth too
  try {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    window.localStorage.removeItem(USER_ID_KEY);
    window.localStorage.removeItem('annotated.username');
    window.localStorage.removeItem('annotated.avatar_url');
  } catch {}
  updateAuthUI();
  if (currentUrl) loadRelatedAnnotations(currentUrl);
  loadFollowingFeed();
}

// ── Init auth check ────────────────────────────────────────────

updateAuthUI();

// Listen for storage changes (e.g., user logs in from another tab)
window.addEventListener('storage', (e) => {
  if (e.key === AUTH_TOKEN_KEY || e.key === USER_ID_KEY) {
    const auth = readWebAuth();
    if (auth) {
      setAuthenticatedUser(auth);
    } else if (!currentUser) {
      updateAuthUI();
    }
  }
});

let currentClip = null;
let currentPage = null;
let currentUrl = null;
let following = [];

const statusEl = document.getElementById('status');
const clipEl = document.getElementById('clip');
const emptyEl = document.getElementById('empty');
const composeEl = document.getElementById('compose');
const commentaryEl = document.getElementById('commentary');
const postBtn = document.getElementById('post-btn');
const followingEl = document.getElementById('following');
const followingListEl = document.getElementById('following-list');
const urlInputEl = document.getElementById('url-input');
const urlSubmitEl = document.getElementById('url-submit');
const urlRowEl = document.getElementById('url-row');
const relatedEl = document.getElementById('related');
const relatedListEl = document.getElementById('related-list');

// ── Follow list (local) ──────────────────────────────────────

async function loadFollowing() {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    following = stored[STORAGE_KEY] || [];
  } catch {
    following = [];
  }
}

async function toggleFollow(userId) {
  if (following.includes(userId)) {
    following = following.filter((id) => id !== userId);
  } else {
    following.push(userId);
  }
  await chrome.storage.local.set({ [STORAGE_KEY]: following });
  // Reload related annotations to re-sort
  if (currentUrl) loadRelatedAnnotations(currentUrl);
  // Also reload following feed
  loadFollowingFeed();
}

// ── Message Handling ──────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  // Page detection from content script (relayed via background)
  if (msg.type === 'PAGE_DETECTED') {
    currentPage = msg;
    currentUrl = msg.url;
    statusEl.style.display = 'block';
    statusEl.innerHTML = `
      <span class="status-type ${msg.sourceType}">${msg.sourceType}</span>
      <span style="margin-left:8px;color:var(--text-dim)">${truncate(msg.title, 50)}</span>
    `;
    loadFollowing().then(() => {
      loadRelatedAnnotations(msg.url);
      loadFollowingFeed();
    });
  }

  // Text selected from content script (relayed via background)
  if (msg.type === 'CLIP_TEXT' || msg.type === 'TEXT_SELECTED') {
    currentClip = { text: msg.text, url: msg.url, title: msg.title };
    showCompose(msg.text);
  }

  // Annotation posted from content script's inline tooltip
  if (msg.type === 'ANNOTATION_POSTED') {
    if (currentUrl) loadRelatedAnnotations(currentUrl);
    loadFollowingFeed();
    showPostSuccess(msg.clipText, msg.commentary);
  }

  // YouTube/Podcast clip info from content script
  if (msg.type === 'CLIP_VIDEO') {
    currentClip = {
      text: msg.clipText || '',
      url: msg.url,
      title: msg.title,
      videoStart: msg.start,
      videoEnd: msg.end,
      videoDuration: msg.duration,
      sourceType: 'youtube',
    };
    showCompose(msg.clipText || 'Video clip');
  }

  // Annotate mode exited from content script (Escape / click outside)
  // Reset the sidepanel compose UI to match
  if (msg.type === 'ANNOTATE_MODE_EXIT') {
    resetCompose();
  }
});

// ── Compose UI ───────────────────────────────────────────────

function showCompose(clipText) {
  clipEl.style.display = 'block';
  clipEl.textContent = `❝ ${truncate(clipText, 200)}`;
  emptyEl.style.display = 'none';
  composeEl.style.display = 'block';
  commentaryEl.focus();
}

function resetCompose() {
  currentClip = null;
  clipEl.style.display = 'none';
  composeEl.style.display = 'none';
  commentaryEl.value = '';
  postBtn.textContent = '✦ Post Annotation';
  postBtn.style.background = '';
  postBtn.disabled = true;
}

function showPostSuccess(clipText, commentary) {
  clipEl.style.display = 'block';
  clipEl.textContent = `✓ ${truncate(clipText || '', 120)}`;
  composeEl.style.display = 'none';
  setTimeout(resetCompose, 3000);
}

// Enable post button when there's commentary
commentaryEl.addEventListener('input', () => {
  postBtn.disabled = !commentaryEl.value.trim();
});

// ── Post Annotation ──────────────────────────────────────────

postBtn.addEventListener('click', async () => {
  if (!currentClip || !commentaryEl.value.trim()) return;

  // Require auth for posting
  if (!currentUser) {
    postBtn.textContent = 'Sign in to post';
    postBtn.disabled = false;
    setTimeout(() => {
      postBtn.textContent = '✦ Post Annotation';
    }, 2000);
    return;
  }

  postBtn.disabled = true;
  postBtn.textContent = 'Posting…';

  try {
    const res = await fetch(`${API_BASE}/api/annotations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentUser.token}`,
      },
      body: JSON.stringify({
        user_id: currentUser.id,
        source_url: currentClip.url,
        source_title: currentClip.title || currentPage?.title || '',
        source_type: currentClip.sourceType || currentPage?.sourceType || detectSourceType(currentClip.url),
        source_domain: domainFrom(currentClip.url) || currentPage?.domain || '',
        clip_text: currentClip.text,
        commentary: commentaryEl.value.trim(),
        is_public: 1,
        clip_start: currentClip.videoStart || null,
        clip_end: currentClip.videoEnd || null,
        clip_duration: currentClip.videoDuration || null,
      }),
    });

    const data = await res.json();
    if (data.id) {
      postBtn.textContent = '✓ Posted!';
      postBtn.style.background = 'var(--success)';

      chrome.runtime.sendMessage({
        type: 'ANNOTATION_POSTED',
        annotationId: data.id,
        clipText: currentClip.text,
        commentary: commentaryEl.value.trim(),
      });

      setTimeout(() => {
        resetCompose();
        if (currentUrl) loadRelatedAnnotations(currentUrl);
        loadFollowingFeed();
      }, 1500);
    } else {
      throw new Error(data.error || 'Unknown error');
    }
  } catch (err) {
    postBtn.textContent = 'Error — retry';
    postBtn.style.background = 'var(--error)';
    setTimeout(() => {
      postBtn.textContent = '✦ Post Annotation';
      postBtn.style.background = '';
      postBtn.disabled = false;
    }, 2000);
  }
});

// ── Related Annotations (same page) ───────────────────────────

async function loadRelatedAnnotations(url) {
  try {
    const res = await fetch(`${API_BASE}/api/feed?limit=50`);
    const data = await res.json();
    const allItems = data.items || [];

    // Filter to annotations on the same source URL (exclude self)
    const myId = currentUser?.id;
    const allRelated = allItems.filter(
      (a) => a.source_url === url && a.user_id !== myId
    );

    if (allRelated.length === 0) {
      relatedEl.style.display = 'none';
      return;
    }

    // Split into followed vs others
    const followed = allRelated.filter((a) => following.includes(a.user_id));
    const others = allRelated.filter((a) => !following.includes(a.user_id));

    relatedEl.style.display = 'block';
    let html = '';

    // Section 1: Following (top)
    if (followed.length > 0) {
      html += `<div class="related-header">Following</div>`;
      html += followed.map((a) => renderRelatedItem(a)).join('');
    }

    // Section 2: Others (most recent)
    if (others.length > 0) {
      html += `<div class="related-header">On this page</div>`;
      html += others.map((a) => renderRelatedItem(a)).join('');
    }

    relatedListEl.innerHTML = html;
  } catch (err) {
    console.warn('Failed to load related annotations:', err);
  }
}

function renderRelatedItem(a) {
  const name = a.display_name || a.username || 'anon';
  const isFollowing = following.includes(a.user_id);
  const followLabel = isFollowing ? 'Unfollow' : 'Follow';
  const followClass = isFollowing ? 'follow-btn-following' : 'follow-btn';

  return `
    <div class="related-item">
      <div class="related-item-quote">❝ ${truncate(escapeHtml(a.clip_text || a.commentary), 100)}</div>
      <div class="related-item-commentary">${escapeHtml(truncate(a.commentary, 140))}</div>
      <div style="margin-top:4px;font-size:11px;color:var(--text-muted)">
        ${name} · ${a.source_domain || ''}
        ${a.like_count ? ` · ♥ ${a.like_count}` : ''}
        ${a.comment_count ? ` · 💬 ${a.comment_count}` : ''}
        <button class="${followClass}" data-user-id="${escapeHtml(a.user_id)}" style="margin-left:8px;padding:2px 8px;border:1px solid var(--border);border-radius:0;background:#fff;font-size:10px;cursor:pointer;font-weight:500">${followLabel}</button>
      </div>
    </div>
  `;
}

// ── Following Feed (recent activity from followed users) ──────

async function loadFollowingFeed() {
  try {
    const res = await fetch(`${API_BASE}/api/feed?limit=50`);
    const data = await res.json();
    const items = data.items || [];

    // Filter to annotations from followed users
    const followedItems = items.filter((a) => following.includes(a.user_id));

    if (followedItems.length === 0) {
      followingEl.style.display = 'none';
      return;
    }

    followingEl.style.display = 'block';
    followingListEl.innerHTML = followedItems.map((a) => `
      <div class="recent-item">
        ${a.clip_text ? `<div class="recent-item-quote">❝ ${truncate(escapeHtml(a.clip_text), 120)}</div>` : ''}
        <div class="recent-item-commentary">${escapeHtml(truncate(a.commentary, 160))}</div>
        <div style="margin-top:4px;font-size:11px;color:var(--text-muted)">
          ${a.display_name || a.username || 'anon'} · ${a.source_domain || domainFrom(a.source_url) || ''}
          ${a.like_count ? ` · ♥ ${a.like_count}` : ''}
          ${a.comment_count ? ` · 💬 ${a.comment_count}` : ''}
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.warn('Failed to load following feed:', err);
  }
}

// ── Paste URL Input ──────────────────────────────────────────

if (urlInputEl && urlSubmitEl) {
  urlSubmitEl.addEventListener('click', handleUrlSubmit);
  urlInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleUrlSubmit();
  });
}

async function handleUrlSubmit() {
  const url = urlInputEl.value.trim();
  if (!url) return;

  let parsedUrl;
  try {
    parsedUrl = new URL(url.startsWith('http') ? url : `https://${url}`);
  } catch {
    return;
  }

  urlInputEl.value = '';
  urlRowEl.style.display = 'none';

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: 'NAVIGATE_TO_URL',
        url: parsedUrl.href,
      }).catch(() => {});
    }
  });

  loadRelatedAnnotations(parsedUrl.href);
  loadFollowingFeed();
}

// ── Helpers ──────────────────────────────────────────────────

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function escapeHtml(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

function domainFrom(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function detectSourceType(url) {
  if (!url) return 'article';
  if (/youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts/i.test(url)) return 'youtube';
  if (/spotify\.com|podcasts\.apple\.com|overcast\.fm/i.test(url)) return 'podcast';
  return 'article';
}

// ── Follow button clicks (delegation) ────────────────────────

relatedListEl.addEventListener('click', (e) => {
  if (e.target.classList.contains('follow-btn') || e.target.classList.contains('follow-btn-following')) {
    e.preventDefault();
    const userId = e.target.dataset.userId;
    if (userId) toggleFollow(userId);
  }
});

// ── Init ─────────────────────────────────────────────────────

loadFollowing();
loadFollowingFeed();
