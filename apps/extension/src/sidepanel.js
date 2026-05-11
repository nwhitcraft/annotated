const API_BASE = 'http://localhost:3080';
const USER_ID = 'demo-user'; // TODO: replace with real auth
const STORAGE_KEY = 'annotated_following';

let currentClip = null;
let currentPage = null;
let currentUrl = null;
let following = []; // user_ids we follow

const statusEl = document.getElementById('status');
const clipEl = document.getElementById('clip');
const emptyEl = document.getElementById('empty');
const composeEl = document.getElementById('compose');
const commentaryEl = document.getElementById('commentary');
const postBtn = document.getElementById('post-btn');
const recentEl = document.getElementById('recent');
const recentListEl = document.getElementById('recent-list');
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
    loadFollowing().then(() => loadRelatedAnnotations(msg.url));
  }

  // Text selected from content script (relayed via background)
  if (msg.type === 'CLIP_TEXT' || msg.type === 'TEXT_SELECTED') {
    currentClip = { text: msg.text, url: msg.url, title: msg.title };
    showCompose(msg.text);
  }

  // Annotation posted from content script's inline tooltip
  if (msg.type === 'ANNOTATION_POSTED') {
    loadRecentAnnotations();
    if (currentUrl) loadRelatedAnnotations(currentUrl);
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

  postBtn.disabled = true;
  postBtn.textContent = 'Posting…';

  try {
    const res = await fetch(`${API_BASE}/api/annotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: USER_ID,
        source_url: currentClip.url,
        source_title: currentClip.title || currentPage?.title || '',
        source_type: currentClip.sourceType || currentPage?.sourceType || detectSourceType(currentClip.url),
        source_domain: domainFrom(currentClip.url) || currentPage?.domain || '',
        clip_text: currentClip.text,
        commentary: commentaryEl.value.trim(),
        is_public: 1,
        // Video clip metadata
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
        loadRecentAnnotations();
        if (currentUrl) loadRelatedAnnotations(currentUrl);
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
    const allRelated = allItems.filter(
      (a) => a.source_url === url && a.user_id !== USER_ID
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
    <div class="recent-item">
      <div class="recent-item-quote">❝ ${truncate(escapeHtml(a.clip_text || a.commentary), 100)}</div>
      <div class="recent-item-commentary">${escapeHtml(truncate(a.commentary, 140))}</div>
      <div style="margin-top:4px;font-size:11px;color:var(--text-muted)">
        ${name} · ${a.source_domain || ''}
        ${a.like_count ? ` · ♥ ${a.like_count}` : ''}
        ${a.comment_count ? ` · 💬 ${a.comment_count}` : ''}
        <button class="${followClass}" data-user-id="${escapeHtml(a.user_id)}" style="margin-left:8px;padding:2px 8px;border:1px solid var(--border);border-radius:0;background:#fff;font-size:10px;cursor:pointer;font-weight:500">${followLabel}</button>
      </div>
    </div>
  `;
}

// ── Recent Annotations ──────────────────────────────────────

async function loadRecentAnnotations() {
  try {
    const res = await fetch(`${API_BASE}/api/feed?limit=10`);
    const data = await res.json();
    const items = data.items || [];

    if (items.length === 0) {
      recentEl.style.display = 'none';
      return;
    }

    recentEl.style.display = 'block';
    recentListEl.innerHTML = items.map((a) => `
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
    console.warn('Failed to load recent annotations:', err);
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

  // Validate URL
  let parsedUrl;
  try {
    parsedUrl = new URL(url.startsWith('http') ? url : `https://${url}`);
  } catch {
    return;
  }

  urlInputEl.value = '';
  urlRowEl.style.display = 'none';

  // Send URL to content script to detect page type
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: 'NAVIGATE_TO_URL',
        url: parsedUrl.href,
      }).catch(() => {});
    }
  });

  // Also load related annotations for this URL
  loadRelatedAnnotations(parsedUrl.href);
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

loadRecentAnnotations();
