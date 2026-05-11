// Content script — highlight + blur overlay + inline annotation UX
// Injected on all pages. Activated ONLY by hotkey (Cmd+Shift+A).

const MAX_CLIP_CHARS = 280;
const MAX_COMMENTARY_CHARS = 500;
const MAX_DURATION = 90; // seconds — per spec
const API_BASE = 'http://localhost:3080';

let annotateMode = false;
let overlayEl = null;
let tooltipEl = null;
let videoTimelineEl = null;

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

  // Show video timeline for YouTube/podcast pages
  if (type === 'youtube' || type === 'podcast') {
    showVideoTimeline(url, type);
  }
}

function detectSourceType(url) {
  if (/youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts/i.test(url)) return 'youtube';
  if (/spotify\.com|podcasts\.apple\.com|overcast\.fm/i.test(url)) return 'podcast';
  return 'article';
}

// ── Video Timeline (YouTube / Podcast) ──────────────────────────

function showVideoTimeline(url, type) {
  removeVideoTimeline();

  videoTimelineEl = document.createElement('div');
  videoTimelineEl.id = 'annotated-timeline';
  videoTimelineEl.innerHTML = `
    <div class="annotated-timeline-header">
      <span class="annotated-timeline-label">Clip this segment</span>
      <span class="annotated-timeline-duration">0:00 / 0:00</span>
    </div>
    <div class="annotated-timeline-track">
      <div class="annotated-timeline-handle annotated-timeline-handle-start" data-handle="start"></div>
      <div class="annotated-timeline-range"></div>
      <div class="annotated-timeline-handle annotated-timeline-handle-end" data-handle="end"></div>
    </div>
    <div class="annotated-timeline-controls">
      <button class="annotated-timeline-btn annotated-timeline-btn-clip" disabled>✦ Clip & Annotate</button>
      <button class="annotated-timeline-btn annotated-timeline-btn-cancel">Cancel</button>
    </div>
  `;

  document.body.appendChild(videoTimelineEl);

  // State
  let totalDuration = 0;
  let start = 0;
  let end = 0;
  let dragging = null;
  let trackRect = null;

  // Try to get video duration from the page
  const videoEl = document.querySelector('video');
  if (videoEl) {
    videoEl.addEventListener('loadedmetadata', () => {
      totalDuration = Math.min(videoEl.duration, MAX_DURATION * 10);
      updateDurationDisplay();
      start = 0;
      end = Math.min(30, totalDuration);
      updateRange();
    });
  }

  // Fallback: if no video element, default to 0-30s
  if (!videoEl) {
    totalDuration = 120;
    start = 0;
    end = 30;
    updateDurationDisplay();
    updateRange();
  }

  function updateDurationDisplay() {
    const durEl = videoTimelineEl.querySelector('.annotated-timeline-duration');
    durEl.textContent = `${formatTime(start)} / ${formatTime(totalDuration)}`;
  }

  function updateRange() {
    const range = videoTimelineEl.querySelector('.annotated-timeline-range');
    const track = videoTimelineEl.querySelector('.annotated-timeline-track');
    trackRect = track.getBoundingClientRect();

    const startPct = (start / totalDuration) * 100;
    const endPct = (end / totalDuration) * 100;
    range.style.left = startPct + '%';
    range.style.width = (endPct - startPct) + '%';

    updateDurationDisplay();

    const clipBtn = videoTimelineEl.querySelector('.annotated-timeline-btn-clip');
    const duration = end - start;
    clipBtn.disabled = duration <= 0 || duration > MAX_DURATION;
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // Drag handles
  const handles = videoTimelineEl.querySelectorAll('.annotated-timeline-handle');
  handles.forEach((handle) => {
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      dragging = handle.dataset.handle;
      document.addEventListener('mousemove', onDrag);
      document.addEventListener('mouseup', stopDrag);
    });
  });

  // Click on track to set position
  const track = videoTimelineEl.querySelector('.annotated-timeline-track');
  track.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('annotated-timeline-handle')) return;
    const rect = track.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const time = Math.max(0, Math.min(totalDuration, pct * totalDuration));
    start = time;
    end = Math.min(time + 10, totalDuration);
    updateRange();
  });

  function onDrag(e) {
    if (!dragging || !trackRect) return;
    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const time = pct * totalDuration;

    if (dragging === 'start') {
      start = Math.min(time, end - 1);
    } else {
      end = Math.max(time, start + 1);
    }
    updateRange();
  }

  function stopDrag() {
    dragging = null;
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', stopDrag);
  }

  // Clip button
  const clipBtn = videoTimelineEl.querySelector('.annotated-timeline-btn-clip');
  clipBtn.addEventListener('click', () => {
    const duration = end - start;
    if (duration <= 0 || duration > MAX_DURATION) return;

    chrome.runtime.sendMessage({
      type: 'CLIP_VIDEO',
      url,
      title: document.title,
      sourceType: type,
      clipText: `Clip: ${formatTime(start)}–${formatTime(end)} of ${document.title}`,
      start,
      end,
      duration: totalDuration,
    });

    removeVideoTimeline();
  });

  // Cancel button
  const cancelBtn = videoTimelineEl.querySelector('.annotated-timeline-btn-cancel');
  cancelBtn.addEventListener('click', () => {
    removeVideoTimeline();
  });
}

function removeVideoTimeline() {
  if (videoTimelineEl) {
    videoTimelineEl.remove();
    videoTimelineEl = null;
  }
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

// ── Annotation Tooltip (speech bubble style) ───────────────────

function showAnnotationTooltip(selectedText, range) {
  removeTooltip();

  const rect = range.getBoundingClientRect();
  const constrained = constrainText(selectedText);

  tooltipEl = document.createElement('div');
  tooltipEl.id = 'annotated-tooltip';
  // Use a template literal with explicit closing quote
  const quoteText = escapeHtml(constrained.text);
  tooltipEl.innerHTML = `
    <div class="annotated-tooltip-quote">"${quoteText}"</div>
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

  // Position as a speech bubble pointing at the selection
  const tooltipHeight = 280;
  const tooltipWidth = Math.min(340, window.innerWidth - 32);
  let top = rect.bottom + window.scrollY + 8;
  let left = Math.max(16, Math.min(rect.left + window.scrollX, window.innerWidth - tooltipWidth - 16));

  // If tooltip would go below viewport, flip above
  if (top + tooltipHeight > window.innerHeight + window.scrollY) {
    top = Math.max(window.scrollY + 8, rect.top + window.scrollY - tooltipHeight);
  }

  tooltipEl.style.top = `${top}px`;
  tooltipEl.style.left = `${left}px`;

  document.body.appendChild(tooltipEl);

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
          user_id: 'demo-user',
          source_url: window.location.href,
          source_title: document.title,
          source_type: detectSourceType(window.location.href),
          source_domain: window.location.hostname.replace(/^www\./, ''),
          clip_text: constrained.text,
          commentary: textarea.value.trim(),
          is_public: 1,
        }),
      });

      const data = await res.json();
      if (data.id) {
        postBtn.textContent = '✓ Posted!';
        postBtn.style.background = '#22c55e';

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
  // Clear any existing selection so user can highlight again
  if (window.getSelection) {
    window.getSelection().removeAllRanges();
  }
  // Notify sidepanel to reset compose state
  chrome.runtime.sendMessage({ type: 'ANNOTATE_MODE_EXIT' }).catch(() => {});
}

// ── Selection Handling ──────────────────────────────────────────

// Only intercept selection when in annotate mode (activated by Cmd+Shift+A)
document.addEventListener('mouseup', (e) => {
  // Don't intercept if clicking inside tooltip or timeline
  if (e.target.closest('#annotated-tooltip')) return;
  if (e.target.closest('#annotated-timeline')) return;

  // Only intercept if in annotate mode (activated by keyboard shortcut)
  if (!annotateMode) return;

  const sel = window.getSelection();
  const text = sel?.toString().trim();

  if (text && text.length > 3) {
    const range = sel.getRangeAt(0);

    try {
      const highlight = document.createElement('span');
      highlight.className = 'annotated-highlight';
      range.surroundContents(highlight);
    } catch {
      // surroundContents fails on partial element selections
    }

    showAnnotationTooltip(text, range);

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
    // Toggle annotate mode — enter mode so user can select text
    if (!annotateMode) {
      enterAnnotateMode();
    } else {
      exitAnnotateMode();
    }
  }
  if (msg.type === 'NAVIGATE_TO_URL') {
    // User pasted a URL in the sidebar — open it
    window.location.href = msg.url;
  }
});

// ── Helpers ─────────────────────────────────────────────────────

function constrainText(text) {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_CLIP_CHARS) {
    return { text: trimmed, truncated: false };
  }
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

let lastUrl = window.location.href;
let navCheckTimer = null;
const observer = new MutationObserver(() => {
  if (navCheckTimer) return;
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
