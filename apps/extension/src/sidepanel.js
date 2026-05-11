const API_BASE = 'http://localhost:3080';
const USER_ID = 'demo-user'; // TODO: replace with real auth

let currentClip = null;
let currentPage = null;

const statusEl = document.getElementById('status');
const clipEl = document.getElementById('clip');
const emptyEl = document.getElementById('empty');
const composeEl = document.getElementById('compose');
const commentaryEl = document.getElementById('commentary');
const postBtn = document.getElementById('post-btn');
const recentEl = document.getElementById('recent');
const recentListEl = document.getElementById('recent-list');

// ── Message Handling ──────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  // Page detection from content script (relayed via background)
  if (msg.type === 'PAGE_DETECTED') {
    currentPage = msg;
    statusEl.style.display = 'block';
    statusEl.innerHTML = `
      <span class="status-type ${msg.sourceType}">${msg.sourceType}</span>
      <span style="margin-left:8px;color:var(--text-dim)">${truncate(msg.title, 50)}</span>
    `;
  }

  // Text selected from content script (relayed via background)
  if (msg.type === 'CLIP_TEXT' || msg.type === 'TEXT_SELECTED') {
    currentClip = { text: msg.text, url: msg.url, title: msg.title };
    showCompose(msg.text);
  }

  // Annotation posted from content script's inline tooltip
  if (msg.type === 'ANNOTATION_POSTED') {
    // Refresh recent list to include the new annotation
    loadRecentAnnotations();
    // Show brief success in sidepanel too
    showPostSuccess(msg.clipText, msg.commentary);
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
  emptyEl.style.display = 'block';
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
        source_type: currentPage?.sourceType || detectSourceType(currentClip.url),
        source_domain: domainFrom(currentClip.url) || currentPage?.domain || '',
        clip_text: currentClip.text,
        commentary: commentaryEl.value.trim(),
        is_public: 1,
      }),
    });

    const data = await res.json();
    if (data.id) {
      postBtn.textContent = '✓ Posted!';
      postBtn.style.background = 'var(--success)';

      // Notify background so content script can update too
      chrome.runtime.sendMessage({
        type: 'ANNOTATION_POSTED',
        annotationId: data.id,
        clipText: currentClip.text,
        commentary: commentaryEl.value.trim(),
      });

      setTimeout(() => {
        resetCompose();
        loadRecentAnnotations();
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
    // Silently fail — API might not be running
    console.warn('Failed to load recent annotations:', err);
  }
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

// ── Init ─────────────────────────────────────────────────────

loadRecentAnnotations();
