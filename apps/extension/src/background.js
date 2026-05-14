const stateByTab = new Map();
const storageArea = chrome.storage.session || chrome.storage.local;
const WEB_BASE = 'https://annotated-nwhitcraft.fly.dev';

function tabKey(tabId) {
  return `tab:${tabId}`;
}

function safeBroadcast(message) {
  try {
    chrome.runtime.sendMessage(message, () => {
      try {
        void chrome.runtime.lastError;
      } catch {
        // Extension page changed while a broadcast was in flight.
      }
    });
  } catch {
    // Best effort only.
  }
}

function activeTabId() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0]?.id || null);
    });
  });
}

async function broadcastIfActive(tabId, message) {
  if (!tabId) return;
  const activeId = await activeTabId();
  if (activeId === tabId) safeBroadcast(message);
}

async function saveTabState(tabId, patch) {
  if (!tabId) return null;
  const previous = stateByTab.get(tabId) || {};
  const next = { ...previous, ...patch, tabId };
  stateByTab.set(tabId, next);
  await storageArea.set({ [tabKey(tabId)]: next });
  return next;
}

async function getTabState(tabId) {
  if (!tabId) return null;
  if (stateByTab.has(tabId)) return stateByTab.get(tabId);

  const stored = await storageArea.get(tabKey(tabId));
  const value = stored[tabKey(tabId)] || null;
  if (value) stateByTab.set(tabId, value);
  return value;
}

async function openPanel(tabId) {
  if (!tabId) return;
  await chrome.sidePanel.open({ tabId });
  const state = await getTabState(tabId);
  if (state) safeBroadcast({ type: 'STATE_UPDATED', state });
}

function sendToTab(tabId, message) {
  if (!tabId) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        const error = chrome.runtime.lastError;
        resolve(error ? null : (response || { ok: true }));
      });
    } catch {
      resolve(null);
    }
  });
}

async function ensureContentScript(tabId) {
  if (!tabId) return false;
  const ready = await sendToTab(tabId, { type: 'PING' });
  if (ready?.ok) return true;

  try {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['src/content.css'],
    });
  } catch {
    // CSS may already be present, or this page may reject extension injection.
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['src/content.js'],
    });
  } catch {
    return false;
  }

  const injectedReady = await sendToTab(tabId, { type: 'PING' });
  return Boolean(injectedReady?.ok);
}

function requestPageInfo(tabId) {
  ensureContentScript(tabId).then((ready) => {
    if (ready) sendToTab(tabId, { type: 'REQUEST_PAGE_INFO' });
  });
}

chrome.action.onClicked.addListener((tab) => {
  openPanel(tab.id);
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.create({ url: `${WEB_BASE}/extension-auth`, active: false }, () => {
    void chrome.runtime.lastError;
  });
});

chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tab = tabs[0];
    if (!tab) return;

    if (command === 'start_clipping') {
      const ready = await ensureContentScript(tab.id);
      if (ready) sendToTab(tab.id, { type: 'START_CLIPPING' });
      return;
    }

    if (command === '_execute_action') openPanel(tab.id);
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (msg.type === 'PAGE_INFO') {
    saveTabState(tabId, {
      pendingUrl: '',
      page: {
        url: msg.url,
        pageUrl: msg.pageUrl,
        title: msg.title,
        sourceType: msg.sourceType,
        domain: msg.domain,
        siteName: msg.siteName,
        author: msg.author,
        publishedAt: msg.publishedAt,
        thumbnail: msg.thumbnail,
      },
    }).then((state) => broadcastIfActive(tabId, { type: 'PAGE_DETECTED', state }));
    return;
  }

  if (msg.type === 'TEXT_SELECTED') {
    const clip = {
      text: msg.text,
      url: msg.url,
      pageUrl: msg.pageUrl,
      title: msg.title,
      sourceType: msg.sourceType,
      domain: msg.domain,
      siteName: msg.siteName,
      author: msg.author,
      publishedAt: msg.publishedAt,
      thumbnail: msg.thumbnail,
      clipStartSec: msg.clipStartSec,
      clipEndSec: msg.clipEndSec,
      selectedAt: msg.selectedAt,
    };

    saveTabState(tabId, {
      pendingUrl: '',
      clip,
      page: {
        url: msg.url,
        pageUrl: msg.pageUrl,
        title: msg.title,
        sourceType: msg.sourceType,
        domain: msg.domain,
        siteName: msg.siteName,
        author: msg.author,
        publishedAt: msg.publishedAt,
        thumbnail: msg.thumbnail,
      },
    })
      .then((state) => {
        broadcastIfActive(tabId, { type: 'CLIP_TEXT', state });
        if (msg.openPanel) openPanel(tabId);
      });
    return;
  }

  if (msg.type === 'GET_ACTIVE_STATE') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const activeTabId = tabs[0]?.id;
      const state = await getTabState(activeTabId);
      requestPageInfo(activeTabId);
      sendResponse({ state: state || null });
    });
    return true;
  }

  if (msg.type === 'ANNOTATION_POSTED') {
    saveTabState(tabId, {
      pendingUrl: '',
      clip: null,
      lastAnnotationId: msg.annotationId || null,
      page: msg.page || null,
    })
      .then((state) => safeBroadcast({ type: 'ANNOTATION_POSTED', state }));
    return;
  }

  if (msg.type === 'STORE_AUTH_TOKEN') {
    storageArea.set({
      auth_token: msg.token,
      auth_user: msg.user || null,
    }).then(() => {
      safeBroadcast({ type: 'AUTH_UPDATED', user: msg.user || null });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === 'CLEAR_AUTH_TOKEN') {
    storageArea.remove(['auth_token', 'auth_user']).then(() => {
      safeBroadcast({ type: 'AUTH_UPDATED', user: null });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === 'GET_AUTH_STATE') {
    storageArea.get(['auth_token', 'auth_user']).then((state) => {
      sendResponse({ token: state.auth_token || '', user: state.auth_user || null });
    });
    return true;
  }

  if (msg.type === 'START_CLIPPING_ACTIVE_TAB') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tabId = tabs[0]?.id;
      const ready = await ensureContentScript(tabId);
      if (ready) sendToTab(tabId, { type: 'START_CLIPPING' });
    });
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    saveTabState(tabId, {
      pendingUrl: changeInfo.url,
      page: null,
      clip: null,
    }).then((state) => broadcastIfActive(tabId, { type: 'TAB_NAVIGATED', state }));
  }

  if (changeInfo.status === 'complete') {
    requestPageInfo(tabId);
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const state = await getTabState(tabId);
  safeBroadcast({ type: 'ACTIVE_TAB_CHANGED', state });
  requestPageInfo(tabId);
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  chrome.tabs.query({ active: true, windowId }, async (tabs) => {
    const tabId = tabs[0]?.id;
    const state = await getTabState(tabId);
    safeBroadcast({ type: 'ACTIVE_TAB_CHANGED', state });
    requestPageInfo(tabId);
  });
});
