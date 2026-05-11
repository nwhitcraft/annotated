// Content script — shortcut-driven clipping mode, source metadata, and media time.

const TOOLTIP_ID = 'annotated-selection-tooltip';
const OVERLAY_ID = 'annotated-clipping-overlay';
const SHORT_CLIP_SECONDS = 60;

let lastUrl = window.location.href;
let clippingMode = false;
let activeClip = null;
let selectionTimer = null;

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
  createOverlay();
  showWaitingHint();

  const mediaClip = clipFromMedia(false);
  if (mediaClip) {
    const rect = currentMedia()?.element.getBoundingClientRect();
    activeClip = mediaClip;
    showAnnotateBubble(rect && rect.width ? rect : centerRect(), 'Annotate current moment');
  }
}

function exitClippingMode() {
  clippingMode = false;
  activeClip = null;
  window.clearTimeout(selectionTimer);
  document.documentElement.classList.remove('annotated-clipping-mode');
  document.getElementById(OVERLAY_ID)?.remove();
  document.getElementById(TOOLTIP_ID)?.remove();
  window.getSelection()?.removeAllRanges();
}

function createOverlay() {
  document.getElementById(OVERLAY_ID)?.remove();
  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.innerHTML = `
    <div class="annotated-pane annotated-pane-top"></div>
    <div class="annotated-pane annotated-pane-right"></div>
    <div class="annotated-pane annotated-pane-bottom"></div>
    <div class="annotated-pane annotated-pane-left"></div>
    <div class="annotated-clipping-hint">Highlight the passage or capture this moment.</div>
  `;
  document.documentElement.append(overlay);
}

function showWaitingHint() {
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) return;
  overlay.classList.remove('has-selection');
  setPaneStyles(centerRect());
}

function showAnnotateBubble(rect, label = 'Annotate') {
  setPaneStyles(rect);

  let button = document.getElementById(TOOLTIP_ID);
  if (!button) {
    button = document.createElement('button');
    button.id = TOOLTIP_ID;
    button.type = 'button';
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      if (!activeClip) return;
      safeSend({ ...activeClip, openPanel: true });
      exitClippingMode();
    });
    document.documentElement.append(button);
  }

  button.textContent = label;
  button.setAttribute('aria-label', label);
  button.style.left = `${Math.min(window.innerWidth - 180, Math.max(12, rect.left + rect.width / 2 - 74))}px`;
  button.style.top = `${Math.max(12, rect.top - 46)}px`;
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

function handleSelectionChange() {
  if (!clippingMode) return;
  window.clearTimeout(selectionTimer);
  selectionTimer = window.setTimeout(() => {
    const clip = clipFromSelection(false);
    if (!clip) return;

    const selection = window.getSelection();
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    if (!rect.width && !rect.height) return;

    activeClip = clip;
    showAnnotateBubble(rect);
  }, 80);
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

document.addEventListener('selectionchange', handleSelectionChange);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && clippingMode) exitClippingMode();
}, true);

document.addEventListener('mousedown', (event) => {
  if (!clippingMode || !activeClip) return;
  const bubble = document.getElementById(TOOLTIP_ID);
  if (bubble && !bubble.contains(event.target)) exitClippingMode();
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
