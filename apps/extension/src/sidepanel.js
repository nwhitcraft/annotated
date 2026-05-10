const API_BASE = 'http://localhost:3080';

let currentClip = null;
let currentPage = null;

const statusEl = document.getElementById('status');
const clipEl = document.getElementById('clip');
const emptyEl = document.getElementById('empty');
const composeEl = document.getElementById('compose');
const commentaryEl = document.getElementById('commentary');
const postBtn = document.getElementById('post-btn');

// Listen for messages from background/content
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'PAGE_DETECTED') {
    currentPage = msg;
    statusEl.style.display = 'block';
    statusEl.innerHTML = `
      <span class="status-type ${msg.sourceType}">${msg.sourceType}</span>
      <span style="margin-left:8px;color:var(--text-dim)">${truncate(msg.title, 50)}</span>
    `;
  }

  if (msg.type === 'CLIP_TEXT') {
    currentClip = { text: msg.text, url: msg.url, title: msg.title };
    clipEl.style.display = 'block';
    clipEl.textContent = `❝ ${truncate(msg.text, 200)}`;
    emptyEl.style.display = 'none';
    composeEl.style.display = 'block';
  }
});

// Enable post button when there's commentary
commentaryEl.addEventListener('input', () => {
  postBtn.disabled = !commentaryEl.value.trim();
});

// Post
postBtn.addEventListener('click', async () => {
  if (!currentClip || !commentaryEl.value.trim()) return;

  postBtn.disabled = true;
  postBtn.textContent = 'Posting...';

  try {
    const res = await fetch(`${API_BASE}/api/annotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: 'demo-user', // TODO: auth
        source_url: currentClip.url,
        source_title: currentClip.title || currentPage?.title || '',
        source_type: currentPage?.sourceType || 'article',
        source_domain: currentPage?.domain || '',
        clip_text: currentClip.text,
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

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '...' : str;
}
