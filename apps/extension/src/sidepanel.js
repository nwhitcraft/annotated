const API_BASE = 'http://localhost:3080';

let currentClip = null;
let currentPage = null;

const statusEl = document.getElementById('status');
const clipEl = document.getElementById('clip');
const emptyEl = document.getElementById('empty');
const composeEl = document.getElementById('compose');
const commentaryEl = document.getElementById('commentary');
const postBtn = document.getElementById('post-btn');
const metaEl = document.getElementById('clip-meta');

hydrate();

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'PAGE_DETECTED' || msg.type === 'CLIP_TEXT' || msg.type === 'STATE_UPDATED') {
    renderState(msg.state);
  }
});

commentaryEl.addEventListener('input', () => {
  updatePostState();
});

postBtn.addEventListener('click', async () => {
  if (!currentClip || !commentaryEl.value.trim()) return;

  postBtn.disabled = true;
  postBtn.textContent = 'Posting...';

  try {
    const res = await fetch(`${API_BASE}/api/annotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: 'demo-user',
        source_url: currentClip.url,
        source_title: currentClip.title || currentPage?.title || '',
        source_type: currentPage?.sourceType || 'article',
        source_domain: currentPage?.domain || '',
        clip_text: currentClip.text || null,
        clip_start_sec: currentClip.clipStartSec ?? null,
        clip_end_sec: currentClip.clipEndSec ?? null,
        commentary: commentaryEl.value.trim(),
      }),
    });

    const data = await res.json();
    if (data.id) {
      postBtn.textContent = '✓ Posted!';
      postBtn.style.background = '#22c55e';
      commentaryEl.value = '';
      currentClip = null;

      setTimeout(() => {
        postBtn.textContent = '✦ Post Annotation';
        postBtn.style.background = '';
        postBtn.disabled = true;
        clipEl.style.display = 'none';
        composeEl.style.display = 'none';
        emptyEl.style.display = 'block';
      }, 2000);
    } else {
      throw new Error(data.error || 'Post failed');
    }
  } catch (err) {
    postBtn.textContent = 'Error — try again';
    postBtn.style.background = '#ef4444';
    setTimeout(() => {
      postBtn.textContent = '✦ Post Annotation';
      postBtn.style.background = '';
      postBtn.disabled = false;
    }, 2000);
  }
});

function hydrate() {
  chrome.runtime.sendMessage({ type: 'GET_ACTIVE_STATE' }, (response) => {
    if (chrome.runtime.lastError) return;
    renderState(response?.state);
  });
}

function renderState(state) {
  if (!state) return;
  currentPage = state.page || currentPage;
  currentClip = state.clip || currentClip;

  if (currentPage) {
    statusEl.hidden = false;
    statusEl.innerHTML = `
      <span class="status-dot ${escapeHtml(currentPage.sourceType || 'article')}"></span>
      <span class="status-source">${escapeHtml(currentPage.sourceType || 'article')}</span>
      <span class="status-title">${escapeHtml(truncate(currentPage.title || currentPage.url || '', 64))}</span>
    `;
  }

  if (currentClip) {
    clipEl.hidden = false;
    clipEl.textContent = currentClip.text;
    metaEl.hidden = false;
    metaEl.textContent = clipMeta(currentClip, currentPage);
    emptyEl.hidden = true;
    composeEl.hidden = false;
  }

  updatePostState();
}

function clipMeta(clip, page) {
  const parts = [page?.domain || clip.domain].filter(Boolean);
  if (clip.clipStartSec != null && clip.clipEndSec != null) {
    parts.push(`${formatTime(clip.clipStartSec)}-${formatTime(clip.clipEndSec)}`);
  }
  return parts.join(' · ');
}

function updatePostState() {
  postBtn.disabled = !currentClip || !commentaryEl.value.trim();
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '...' : str;
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
