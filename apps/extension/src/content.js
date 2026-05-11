// Content script — highlight + blur overlay + inline annotation UX
// Injected on all pages. Activated by hotkey (Cmd+Shift+A) or extension click.

const MAX_CLIP_CHARS = 280;
const MAX_COMMENTARY_CHARS = 500;
const API_BASE = 'http://localhost:3080';

let annotateMode = false;
let overlayEl = null;
let tooltipEl = null;

// ── Page Detection ──────────────────────────────────────────────

function detectPage() {
  const url = window.location.href;
  const type = detectSourceType(url);

  chrome.runtime.sendMessage({
    type: 'PAGE_INFO',
    url,
    title: document.title,
    sourceType: type,
    domain: window.location.hostname.replace(/^www\./, ''),
  });
}

function detectSourceType(url) {
  if (/youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts/i.test(url)) return 'youtube';
  if (/spotify\.com|podcasts\.apple\.com|overcast\.fm/i.test(url)) return 'podcast';
  return 'article';
}

// ── Blur Overlay ────────────────────────────────────────────────

function createOverlay() {
  if (overlayEl) return;
  overlayEl = document.createElement('div');
  overlayEl.id = 'annotated-overlay';
  overlayEl.addEventListener('click', exitAnnotateMode);
  document.body.appendChild(overlayEl);
}

function removeOverlay() {
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
}

// ── Annotation Tooltip ──────────────────────────────────────────

function showAnnotationTooltip(selectedText, range) {
  removeTooltip();

  const rect = range.getBoundingClientRect();
  const constrained = constrainText(selectedText);

  tooltipEl = document.createElement('div');
  tooltipEl.id = 'annotated-tooltip';
  tooltipEl.innerHTML = `
    <div class="annotated-tooltip-quote">"${escapeHtml(constrained.text)}"</div>
    ${constrained.truncated ? '<div class="annotated-tooltip-truncated">Trimmed to ~2 sentences</div>' : ''}
    <textarea class="annotated-tooltip-textarea" placeholder="What's your take?" rows="3" maxlength="${MAX_COMMENTARY_CHARS}"></textarea>
    <div class="annotated-tooltip-actions">
      <span class="annotated-tooltip-chars"><span class="annotated-tooltip-chars-count">0</span>/${MAX_COMMENTARY_CHARS}</span>
      <div class="annotated-tooltip-btns">
        <button class="annotated-tooltip-cancel">Cancel</button>
        <button class="annotated-tooltip-post" disabled>✦ Post</button>
      </div>
    </div>
  `;

  // Position below the selection, with viewport boundary checks
  const tooltipHeight = 280; // approximate max height
  let top = rect.bottom + window.scrollY + 8;
  let left = Math.max(16, Math.min(rect.left + window.scrollX, window.innerWidth - 360));

  // If tooltip would go below viewport, position above selection
  if (top + tooltipHeight > window.innerHeight + window.scrollY) {
    top = Math.max(window.scrollY + 8, rect.top + window.scrollY - tooltipHeight);
  }

  tooltipEl.style.top = `${top}px`;
  tooltipEl.style.left = `${left}px`;

  document.body.appendChild(tooltipEl);

  // Wire up events
  const textarea = tooltipEl.querySelector('.annotated-tooltip-textarea');
  const postBtn = tooltipEl.querySelector('.annotated-tooltip-post');
  const cancelBtn = tooltipEl.querySelector('.annotated-tooltip-cancel');
  const charsCount = tooltipEl.querySelector('.annotated-tooltip-chars-count');

  textarea.focus();

  textarea.addEventListener('input', () => {
    const len = textarea.value.trim().length;
    charsCount.textContent = len;
    postBtn.disabled = len === 0;
  });

  cancelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    exitAnnotateMode();
  });

  postBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!textarea.value.trim()) return;

    postBtn.disabled = true;
    postBtn.textContent = 'Posting…';

    try {
      const res = await fetch(`${API_BASE}/api/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: 'demo-user', // TODO: real auth
          source_url: window.location.href,
          source_title: document.title,
          source_type: detectSourceType(window.location.href),
          source_domain: window.location.hostname.replace(/^www\./, ''),
          clip_text: constrained.text,
          commentary: textarea.value.trim(),
          is_public: 1, // Chrome extension = always public (free tier)
        }),
      });

      const data = await res.json();
      if (data.id) {
        postBtn.textContent = '✓ Posted!';
        postBtn.style.background = '#22c55e';

        // Also notify the sidebar
        chrome.runtime.sendMessage({
          type: 'ANNOTATION_POSTED',
          annotationId: data.id,
          clipText: constrained.text,
          commentary: textarea.value.trim(),
        });

        setTimeout(() => exitAnnotateMode(), 1500);
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (err) {
      postBtn.textContent = 'Error — retry';
      postBtn.style.background = '#ef4444';
      setTimeout(() => {
        postBtn.textContent = '✦ Post';
        postBtn.style.background = '';
        postBtn.disabled = false;
      }, 2000);
    }
  });

  // ESC to cancel
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      exitAnnotateMode();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

function removeTooltip() {
  if (tooltipEl) {
    tooltipEl.remove();
    tooltipEl = null;
  }
}

// ── Annotate Mode ───────────────────────────────────────────────

function enterAnnotateMode() {
  annotateMode = true;
  document.body.classList.add('annotated-active');
  createOverlay();
}

function exitAnnotateMode() {
  annotateMode = false;
  document.body.classList.remove('annotated-active');
  removeOverlay();
  removeTooltip();
  window.getSelection()?.removeAllRanges();
}

// ── Selection Handling ──────────────────────────────────────────

document.addEventListener('mouseup', (e) => {
  // Don't capture clicks inside our own tooltip
  if (e.target.closest('#annotated-tooltip')) return;

  const sel = window.getSelection();
  const text = sel?.toString().trim();

  if (text && text.length > 3) {
    const range = sel.getRangeAt(0);

    // Enter annotate mode with blur
    enterAnnotateMode();

    // Highlight the selected text
    try {
      const highlight = document.createElement('span');
      highlight.className = 'annotated-highlight';
      range.surroundContents(highlight);
    } catch {
      // surroundContents fails on partial element selections — that's OK,
      // the native ::selection highlight still shows
    }

    showAnnotationTooltip(text, range);

    // Also send to sidebar (backwards compat)
    chrome.runtime.sendMessage({
      type: 'TEXT_SELECTED',
      text: constrainText(text).text,
      url: window.location.href,
      title: document.title,
    });
  }
});

// ── Listen for activate message from background ─────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'ACTIVATE_ANNOTATE') {
    enterAnnotateMode();
  }
});

// ── Helpers ─────────────────────────────────────────────────────

function constrainText(text) {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_CLIP_CHARS) {
    return { text: trimmed, truncated: false };
  }
  // Try to break at sentence boundary
  const cut = trimmed.slice(0, MAX_CLIP_CHARS);
  const sentenceEnd = Math.max(
    cut.lastIndexOf('. '),
    cut.lastIndexOf('! '),
    cut.lastIndexOf('? ')
  );
  const breakAt = sentenceEnd > MAX_CLIP_CHARS * 0.5 ? sentenceEnd + 1 : cut.lastIndexOf(' ');
  return {
    text: (breakAt > 0 ? cut.slice(0, breakAt) : cut) + '…',
    truncated: true,
  };
}

function escapeHtml(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

// ── Init ────────────────────────────────────────────────────────

detectPage();

// SPA navigation detection — throttle to avoid noise
let lastUrl = window.location.href;
let navCheckTimer = null;
const observer = new MutationObserver(() => {
  if (navCheckTimer) return; // debounce
  navCheckTimer = setTimeout(() => {
    navCheckTimer = null;
    const newUrl = window.location.href;
    if (newUrl !== lastUrl) {
      lastUrl = newUrl;
      detectPage();
    }
  }, 500);
});
observer.observe(document.body, { childList: true, subtree: true });
