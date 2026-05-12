// Content script — shortcut-driven clipping mode, source metadata, and media time.

const API_BASE = 'http://localhost:3080';
const USER_ID = 'demo-user';
const COMPOSER_ID = 'annotated-page-composer';
const OVERLAY_ID = 'annotated-clipping-overlay';
const SHORT_CLIP_SECONDS = 90;

let lastUrl = window.location.href;
let clippingMode = false;
let activeClip = null;
let activeRange = null;
let selecting = false;
let selectionTimer = null;
let trackingFrame = null;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'START_CLIPPING') enterClippingMode();
  if (msg.type === 'EXIT_CLIPPING') exitClippingMode();
});

function detectSourceType(url) {
  if (/youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts/i.test(url)) return 'youtube';
  if (/spotify\.com|podcasts\.apple\.com|overcast\.fm|pocketcasts|castbox|podbean|anchor\.fm|podcasts\.google/i.test(url)) return 'podcast';
  if (/\.mp3$|\.m4a$|\.wav$|\/audio\//i.test(url)) return 'podcast';
  return 'article';
}

function getPageInfo() {
  const canonical = document.querySelector('link[rel="canonical"]')?.href || window.location.href;
  const title = meta(['og:title', 'twitter:title']) || document.title.replace(/\s+-\s+YouTube$/, '');
  const siteName = meta(['og:site_name', 'application-name']) || window.location.hostname.replace(/^www\./, '');
  const publishedAt = meta(['article:published_time', 'datePublished', 'date', 'pubdate']);
  const author = meta(['author', 'article:author', 'parsely-author', 'byl']);
  const thumbnail = meta(['og:image', 'twitter:image']);

  return {
    type: 'PAGE_INFO',
    url: canonical,
    pageUrl: window.location.href,
    title,
    sourceType: detectSourceType(window.location.href),
    domain: new URL(canonical, window.location.href).hostname.replace(/^www\./, ''),
    siteName,
    author,
    publishedAt,
    thumbnail,
  };
}

function meta(names) {
  for (const name of names) {
    const node = document.querySelector(`meta[name="${cssEscape(name)}"], meta[property="${cssEscape(name)}"], meta[itemprop="${cssEscape(name)}"]`);
    const value = node?.getAttribute('content')?.trim();
    if (value) return value;
  }
  return '';
}

function cssEscape(value) {
  return String(value).replace(/["\\]/g, '\\$&');
}

function currentMedia() {
  const media = [...document.querySelectorAll('video, audio')]
    .find((item) => Number.isFinite(item.currentTime) && item.readyState > 0);
  if (!media) return null;

  const start = Math.max(0, Math.floor(media.currentTime || 0));
  return {
    element: media,
    start,
    end: start + SHORT_CLIP_SECONDS,
  };
}

function clipFromSelection(openPanel = false) {
  const selection = window.getSelection();
  const text = selection?.toString().replace(/\s+/g, ' ').trim();
  if (!selection || !text || selection.rangeCount === 0) return null;

  const page = getPageInfo();
  const media = currentMedia();
  return {
    type: 'TEXT_SELECTED',
    text,
    url: page.url,
    pageUrl: page.pageUrl,
    title: page.title,
    sourceType: page.sourceType,
    domain: page.domain,
    siteName: page.siteName,
    author: page.author,
    publishedAt: page.publishedAt,
    thumbnail: page.thumbnail,
    clipStartSec: media?.start ?? null,
    clipEndSec: media?.end ?? null,
    selectedAt: Date.now(),
    openPanel,
  };
}

function clipFromMedia(openPanel = false) {
  const page = getPageInfo();
  const media = currentMedia();
  if (!media || page.sourceType === 'article') return null;

  return {
    type: 'TEXT_SELECTED',
    text: '',
    url: page.url,
    pageUrl: page.pageUrl,
    title: page.title,
    sourceType: page.sourceType,
    domain: page.domain,
    siteName: page.siteName,
    author: page.author,
    publishedAt: page.publishedAt,
    thumbnail: page.thumbnail,
    clipStartSec: media.start,
    clipEndSec: media.end,
    selectedAt: Date.now(),
    openPanel,
  };
}

function enterClippingMode() {
  clippingMode = true;
  activeClip = null;
  document.documentElement.classList.add('annotated-clipping-mode');

  const mediaClip = clipFromMedia(false);
  if (mediaClip) {
    const rect = currentMedia()?.element.getBoundingClientRect();
    activeClip = mediaClip;
    activeRange = null;
    showComposer(rect && rect.width ? rect : centerRect());
  }
}

function exitClippingMode() {
  clippingMode = false;
  activeClip = null;
  activeRange = null;
  window.clearTimeout(selectionTimer);
  if (trackingFrame) cancelAnimationFrame(trackingFrame);
  trackingFrame = null;
  document.documentElement.classList.remove('annotated-clipping-mode');
  document.getElementById(OVERLAY_ID)?.remove();
  document.getElementById(COMPOSER_ID)?.remove();
  window.getSelection()?.removeAllRanges();
}

function createOverlay(rect) {
  document.getElementById(OVERLAY_ID)?.remove();
  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.innerHTML = `
    <div class="annotated-pane annotated-pane-top"></div>
    <div class="annotated-pane annotated-pane-right"></div>
    <div class="annotated-pane annotated-pane-bottom"></div>
    <div class="annotated-pane annotated-pane-left"></div>
  `;
  document.documentElement.append(overlay);
  setPaneStyles(rect);
}

function setPaneStyles(rect) {
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) return;
  overlay.classList.add('has-selection');

  const top = overlay.querySelector('.annotated-pane-top');
  const right = overlay.querySelector('.annotated-pane-right');
  const bottom = overlay.querySelector('.annotated-pane-bottom');
  const left = overlay.querySelector('.annotated-pane-left');
  const pad = 8;
  const x = Math.max(0, rect.left - pad);
  const y = Math.max(0, rect.top - pad);
  const width = Math.min(window.innerWidth - x, rect.width + pad * 2);
  const height = Math.min(window.innerHeight - y, rect.height + pad * 2);

  top.style.cssText = `left:0;top:0;width:100%;height:${y}px`;
  right.style.cssText = `left:${x + width}px;top:${y}px;width:${Math.max(0, window.innerWidth - x - width)}px;height:${height}px`;
  bottom.style.cssText = `left:0;top:${y + height}px;width:100%;height:${Math.max(0, window.innerHeight - y - height)}px`;
  left.style.cssText = `left:0;top:${y}px;width:${x}px;height:${height}px`;
}

function scheduleSelectionCapture() {
  if (!clippingMode) return;
  window.clearTimeout(selectionTimer);
  selectionTimer = window.setTimeout(captureCompletedSelection, 120);
}

function captureCompletedSelection() {
  if (!clippingMode) return;
  const clip = clipFromSelection(false);
  if (!clip) return;

  const selection = window.getSelection();
  activeRange = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
  const rect = getSelectionRect();
  if (!rect) return;

  activeClip = clip;
  showComposer(rect);
}

function getSelectionRect() {
  const selection = window.getSelection();
  const range = activeRange || (selection?.rangeCount ? selection.getRangeAt(0) : null);
  if (!range) return null;

  return rectFromRange(range);
}

function rectFromRange(range) {
  const rects = [...range.getClientRects()]
    .filter((rect) => rect.width > 0 && rect.height > 0);
  if (!rects.length) return null;

  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  return { left, top, width: right - left, height: bottom - top };
}

function showComposer(rect) {
  if (!activeClip) return;

  createOverlay(rect);
  document.getElementById(COMPOSER_ID)?.remove();

  const composer = document.createElement('section');
  composer.id = COMPOSER_ID;
  composer.className = 'quote-annotation-bubble annotated-page-composer';
  composer.setAttribute('aria-label', 'Quote annotation');
  composer.style.visibility = 'hidden';
  composer.innerHTML = `
    <label class="quote-annotation-bubble__prompt" for="annotated-page-commentary">Your Thoughts Here:</label>
    <textarea
      id="annotated-page-commentary"
      class="quote-annotation-bubble__textarea"
      rows="4"
    ></textarea>
    <div class="quote-annotation-bubble__actions">
      <button class="quote-annotation-bubble__button" type="button">Annotate</button>
    </div>
  `;

  composer.addEventListener('mousedown', (event) => event.stopPropagation());
  composer.querySelector('button').addEventListener('click', () => postAnnotation(composer));

  document.documentElement.append(composer);
  positionComposer(composer, rect);
  composer.style.visibility = '';
  composer.querySelector('textarea').focus();
}

function positionComposer(composer, rect) {
  const margin = 18;
  const gap = 16;
  const width = Math.min(620, window.innerWidth - margin * 2);
  const left = Math.max(margin, Math.min(window.innerWidth - width - margin, rect.left + rect.width / 2 - width / 2));

  composer.style.width = `${width}px`;
  composer.style.maxHeight = '';

  const measuredHeight = Math.min(composer.offsetHeight || 224, window.innerHeight - margin * 2);
  const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
  const spaceAbove = rect.top - gap - margin;
  const placeBelow = spaceBelow >= measuredHeight || spaceBelow >= spaceAbove;
  const availableSpace = Math.max(140, placeBelow ? spaceBelow : spaceAbove);
  const height = Math.min(measuredHeight, availableSpace);
  const top = placeBelow
    ? Math.min(rect.bottom + gap, window.innerHeight - height - margin)
    : Math.max(margin, rect.top - height - gap);

  composer.style.left = `${left}px`;
  composer.style.top = `${top}px`;
  composer.style.maxHeight = `${availableSpace}px`;
}

function updateAnchoredUi() {
  trackingFrame = null;
  if (!clippingMode || !activeClip || !activeRange) return;

  const rect = rectFromRange(activeRange);
  if (!rect) return;

  setPaneStyles(rect);
  const composer = document.getElementById(COMPOSER_ID);
  if (composer) positionComposer(composer, rect);
}

function scheduleAnchoredUiUpdate() {
  if (!clippingMode || !activeRange || trackingFrame) return;
  trackingFrame = requestAnimationFrame(updateAnchoredUi);
}

async function postAnnotation(composer) {
  const textarea = composer.querySelector('textarea');
  const button = composer.querySelector('button');
  const commentary = textarea.value.trim();
  if (!commentary || !activeClip) return;

  button.disabled = true;
  button.textContent = 'Posting';

  try {
    await ensureUser();
    const mediaClip = await maybeCreateMediaClip(activeClip);
    const response = await fetch(`${API_BASE}/api/annotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: USER_ID,
        source_url: activeClip.url,
        source_title: mediaClip?.title || activeClip.title || '',
        source_type: activeClip.sourceType || 'article',
        source_domain: activeClip.domain || '',
        source_site_name: activeClip.siteName || null,
        source_author: activeClip.author || null,
        source_published_at: activeClip.publishedAt || null,
        source_thumbnail: mediaClip?.thumbnail || activeClip.thumbnail || null,
        clip_text: activeClip.text || null,
        clip_start_sec: mediaClip?.startSec ?? activeClip.clipStartSec ?? null,
        clip_end_sec: mediaClip?.endSec ?? activeClip.clipEndSec ?? null,
        clip_media_path: mediaClip?.mediaPath || null,
        commentary,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.id) throw new Error(data.error || 'Post failed');

    button.textContent = 'Posted';
    safeSend({ type: 'ANNOTATION_POSTED', page: getPageInfo() });
    window.setTimeout(exitClippingMode, 600);
  } catch {
    button.disabled = false;
    button.textContent = 'Error - try again';
  }
}

function centerRect() {
  return {
    left: Math.round(window.innerWidth * 0.18),
    top: Math.round(window.innerHeight * 0.26),
    width: Math.round(window.innerWidth * 0.64),
    height: Math.max(80, Math.round(window.innerHeight * 0.18)),
  };
}

function safeSend(message) {
  chrome.runtime.sendMessage(message, () => {
    void chrome.runtime.lastError;
  });
}

function detectPage() {
  safeSend(getPageInfo());
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && clippingMode) {
    exitClippingMode();
    return;
  }

  if (!event.repeat && isClippingShortcut(event)) {
    event.preventDefault();
    event.stopPropagation();
    enterClippingMode();
  }

  if (clippingMode && event.key.startsWith('Arrow')) {
    scheduleSelectionCapture();
  }
}, true);

window.addEventListener('keyup', (event) => {
  if (!clippingMode) return;
  if (event.key === 'Shift' || event.key.startsWith('Arrow')) scheduleSelectionCapture();
}, true);

document.addEventListener('mousedown', (event) => {
  if (!clippingMode) return;
  const composer = document.getElementById(COMPOSER_ID);
  if (composer?.contains(event.target)) return;
  if (composer && !composer.contains(event.target)) {
    exitClippingMode();
    return;
  }
  selecting = true;
  document.getElementById(COMPOSER_ID)?.remove();
  document.getElementById(OVERLAY_ID)?.remove();
}, true);

document.addEventListener('mouseup', () => {
  if (!clippingMode || !selecting) return;
  selecting = false;
  scheduleSelectionCapture();
}, true);

window.addEventListener('scroll', scheduleAnchoredUiUpdate, true);
window.addEventListener('resize', scheduleAnchoredUiUpdate);

detectPage();

const startObserver = () => {
  const target = document.body || document.documentElement;
  if (!target) return;

  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      exitClippingMode();
      detectPage();
    }
  });
  observer.observe(target, { childList: true, subtree: true });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startObserver, { once: true });
} else {
  startObserver();
}

function isClippingShortcut(event) {
  return event.shiftKey
    && event.code === 'KeyX'
    && (event.metaKey || event.ctrlKey || event.altKey);
}

async function ensureUser() {
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
}

async function maybeCreateMediaClip(clip) {
  const type = clip.sourceType;
  if (!['youtube', 'podcast'].includes(type) || clip.clipStartSec == null || clip.clipEndSec == null) return null;

  try {
    const response = await fetch(`${API_BASE}/api/clip/${type}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: clip.pageUrl || clip.url,
        start: clip.clipStartSec,
        end: clip.clipEndSec,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || 'Clip failed');
    return data;
  } catch {
    return null;
  }
}
