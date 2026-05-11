// Content script: capture page context and clips, then hand off to the side panel.

const OVERLAY_ID = 'annotated-clipping-overlay';
const SHORT_CLIP_SECONDS = 90;
const PODCAST_DOMAINS = [
  'podcasts.apple.com',
  'open.spotify.com',
  'soundcloud.com',
  'overcast.fm',
  'pca.st',
  'pocketcasts.com',
  'castro.fm',
  'anchor.fm',
];

let lastUrl = window.location.href;
let clippingMode = false;
let selecting = false;
let selectionTimer = null;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'START_CLIPPING') enterClippingMode();
  if (msg.type === 'EXIT_CLIPPING') exitClippingMode();
});

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.type !== 'ANNOTATED_AUTH_TOKEN' || !event.data.token) return;
  safeSend({
    type: 'STORE_AUTH_TOKEN',
    token: event.data.token,
    user: event.data.user || null,
  });
});

function detectSourceType(url) {
  if (/youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts/i.test(url)) return 'youtube';
  if (/twitter\.com|x\.com/i.test(url)) return 'twitter';
  if (PODCAST_DOMAINS.some((domain) => url.includes(domain))) return 'podcast';
  if (/\.mp3$|\.m4a$|\.wav$|\/audio\//i.test(url)) return 'podcast';
  return 'article';
}

function getPageInfo() {
  const jsonLd = parseJsonLd();
  const canonical = document.querySelector('link[rel="canonical"]')?.href || window.location.href;
  const title = meta(['og:title', 'twitter:title']) || jsonLd.headline || jsonLd.name || document.title.replace(/\s+-\s+YouTube$/, '');
  const siteName = meta(['og:site_name', 'application-name']) || jsonLd.publisher?.name || window.location.hostname.replace(/^www\./, '');
  const publishedAt = meta(['article:published_time', 'datePublished', 'date', 'pubdate']) || jsonLd.datePublished || '';
  const author = meta(['author', 'article:author', 'parsely-author', 'byl']) || jsonLd.author?.name || '';
  const thumbnail = meta(['og:image', 'twitter:image']) || jsonLd.image?.url || jsonLd.image || '';

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

function parseJsonLd() {
  for (const node of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const raw = JSON.parse(node.textContent || '{}');
      const item = Array.isArray(raw) ? raw[0] : raw['@graph']?.[0] || raw;
      if (item && typeof item === 'object') return item;
    } catch {
      // Ignore malformed publisher JSON.
    }
  }
  return {};
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
    end: Math.min(start + SHORT_CLIP_SECONDS, Math.floor(media.duration || start + SHORT_CLIP_SECONDS)),
  };
}

function clipFromSelection(openPanel = true) {
  const selection = window.getSelection();
  const text = selection?.toString().replace(/\s+/g, ' ').trim();
  if (!selection || !text || selection.rangeCount === 0) return null;

  const page = getPageInfo();
  const media = currentMedia();
  return clipPayload(page, {
    text,
    clipStartSec: media?.start ?? null,
    clipEndSec: media?.end ?? null,
    openPanel,
  });
}

function clipFromMedia(openPanel = true) {
  const page = getPageInfo();
  const media = currentMedia();
  if (!media || page.sourceType === 'article') return null;
  return clipPayload(page, {
    text: '',
    clipStartSec: media.start,
    clipEndSec: media.end,
    openPanel,
  });
}

function clipPayload(page, patch) {
  return {
    type: 'TEXT_SELECTED',
    text: patch.text || '',
    url: page.url,
    pageUrl: page.pageUrl,
    title: page.title,
    sourceType: page.sourceType,
    domain: page.domain,
    siteName: page.siteName,
    author: page.author,
    publishedAt: page.publishedAt,
    thumbnail: page.thumbnail,
    clipStartSec: patch.clipStartSec,
    clipEndSec: patch.clipEndSec,
    selectedAt: Date.now(),
    openPanel: patch.openPanel,
  };
}

function enterClippingMode() {
  clippingMode = true;
  document.documentElement.classList.add('annotated-clipping-mode');

  const mediaClip = clipFromMedia(true);
  if (mediaClip) {
    safeSend(mediaClip);
    createOverlay(currentMedia()?.element.getBoundingClientRect() || centerRect());
  }
}

function exitClippingMode() {
  clippingMode = false;
  selecting = false;
  window.clearTimeout(selectionTimer);
  document.documentElement.classList.remove('annotated-clipping-mode');
  document.getElementById(OVERLAY_ID)?.remove();
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
  const clip = clipFromSelection(true);
  if (!clip) return;
  const rect = getSelectionRect();
  if (rect) createOverlay(rect);
  safeSend(clip);
  window.setTimeout(exitClippingMode, 250);
}

function getSelectionRect() {
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  if (!range) return null;

  const rects = [...range.getClientRects()]
    .filter((rect) => rect.width > 0 && rect.height > 0);
  if (!rects.length) return null;

  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  return { left, top, width: right - left, height: bottom - top };
}

function centerRect() {
  return {
    left: Math.round(window.innerWidth * 0.18),
    top: Math.round(window.innerHeight * 0.26),
    width: Math.round(window.innerWidth * 0.64),
    height: Math.max(80, Math.round(window.innerHeight * 0.18)),
  };
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

document.addEventListener('mousedown', () => {
  if (!clippingMode) return;
  selecting = true;
  document.getElementById(OVERLAY_ID)?.remove();
}, true);

document.addEventListener('mouseup', () => {
  if (!clippingMode || !selecting) return;
  selecting = false;
  scheduleSelectionCapture();
}, true);

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
    && event.code === 'KeyA'
    && (event.metaKey || event.ctrlKey || event.altKey);
}

function safeSend(message) {
  chrome.runtime.sendMessage(message, () => {
    void chrome.runtime.lastError;
  });
}
