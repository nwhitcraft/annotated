// Content script — captures text selections, page metadata, and media time.

const TOOLTIP_ID = 'annotated-selection-tooltip';
let lastUrl = window.location.href;
let tooltipTimer = null;

function detectSourceType(url) {
  if (/youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts/i.test(url)) return 'youtube';
  if (/spotify\.com|podcasts\.apple\.com|overcast\.fm|pocketcasts|castbox|podbean|anchor\.fm|podcasts\.google/i.test(url)) return 'podcast';
  if (/\.mp3$|\.m4a$|\.wav$|\/audio\//i.test(url)) return 'podcast';
  return 'article';
}

function getPageInfo() {
  const url = window.location.href;
  return {
    type: 'PAGE_INFO',
    url,
    title: document.title,
    sourceType: detectSourceType(url),
    domain: window.location.hostname.replace(/^www\./, ''),
  };
}

function getCurrentMediaTime() {
  const media = document.querySelector('video, audio');
  if (!media || !Number.isFinite(media.currentTime)) return null;
  return Math.max(0, Math.floor(media.currentTime));
}

function safeSend(message) {
  chrome.runtime.sendMessage(message, () => {
    void chrome.runtime.lastError;
  });
}

function detectPage() {
  safeSend(getPageInfo());
}

function captureSelection(openPanel = false) {
  const selection = window.getSelection();
  const text = selection?.toString().replace(/\s+/g, ' ').trim();
  if (!selection || !text || text.length < 3 || selection.rangeCount === 0) return null;

  const page = getPageInfo();
  const startSec = getCurrentMediaTime();
  const clip = {
    type: 'TEXT_SELECTED',
    text,
    url: page.url,
    title: page.title,
    sourceType: page.sourceType,
    domain: page.domain,
    clipStartSec: startSec,
    clipEndSec: startSec == null ? null : startSec + 60,
    selectedAt: Date.now(),
    openPanel,
  };

  safeSend(clip);
  return { selection, clip };
}

function removeTooltip() {
  document.getElementById(TOOLTIP_ID)?.remove();
  if (tooltipTimer) window.clearTimeout(tooltipTimer);
  tooltipTimer = null;
}

function showTooltip(selection) {
  removeTooltip();
  if (!selection.rangeCount) return;

  const rect = selection.getRangeAt(0).getBoundingClientRect();
  if (!rect.width && !rect.height) return;

  const button = document.createElement('button');
  button.id = TOOLTIP_ID;
  button.type = 'button';
  button.textContent = 'Annotate';
  button.setAttribute('aria-label', 'Annotate selected text');
  button.style.left = `${Math.min(window.innerWidth - 110, Math.max(12, rect.left + rect.width / 2 - 45))}px`;
  button.style.top = `${Math.max(12, rect.top - 42)}px`;
  button.addEventListener('mousedown', (event) => event.preventDefault());
  button.addEventListener('click', () => {
    captureSelection(true);
    removeTooltip();
  });

  document.documentElement.append(button);
  tooltipTimer = window.setTimeout(removeTooltip, 8000);
}

function handleSelection() {
  const result = captureSelection(false);
  if (result) showTooltip(result.selection);
  else removeTooltip();
}

document.addEventListener('mouseup', () => {
  window.setTimeout(handleSelection, 0);
});

document.addEventListener('keyup', (event) => {
  if (event.key === 'Shift' || event.key.startsWith('Arrow')) {
    window.setTimeout(handleSelection, 0);
  }
});

document.addEventListener('selectionchange', () => {
  if (!window.getSelection()?.toString().trim()) removeTooltip();
});

detectPage();

const startObserver = () => {
  const target = document.body || document.documentElement;
  if (!target) return;

  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      removeTooltip();
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
