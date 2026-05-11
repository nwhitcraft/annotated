const stateByTab = new Map();
const storageArea = chrome.storage.session || chrome.storage.local;

function tabKey(tabId) {
  return `tab:${tabId}`;
}

function safeBroadcast(message) {
  chrome.runtime.sendMessage(message, () => {
    void chrome.runtime.lastError;
  });
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
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, message, () => {
    void chrome.runtime.lastError;
  });
}

chrome.action.onClicked.addListener((tab) => {
  openPanel(tab.id);
});

chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab) return;

    if (command === 'start_clipping') {
      sendToTab(tab.id, { type: 'START_CLIPPING' });
      return;
    }

    if (command === '_execute_action') openPanel(tab.id);
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (msg.type === 'PAGE_INFO') {
    saveTabState(tabId, {
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
    }).then((state) => {
      safeBroadcast({ type: 'PAGE_DETECTED', state });
    });
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
        safeBroadcast({ type: 'CLIP_TEXT', state });
        if (msg.openPanel) openPanel(tabId);
      });
    return;
  }

  if (msg.type === 'GET_ACTIVE_STATE') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const activeTabId = tabs[0]?.id;
      const state = await getTabState(activeTabId);
      sendResponse({ state: state || null });
    });
    return true;
  }

  if (msg.type === 'START_CLIPPING_ACTIVE_TAB') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      sendToTab(tabs[0]?.id, { type: 'START_CLIPPING' });
    });
  }
});
