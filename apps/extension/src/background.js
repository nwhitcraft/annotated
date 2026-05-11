// Background service worker — handles hotkey, side panel, and message routing

// Open side panel on extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  // Open sidebar
  await chrome.sidePanel.open({ tabId: tab.id });
  // Also activate annotate mode on the page
  chrome.tabs.sendMessage(tab.id, { type: 'ACTIVATE_ANNOTATE' }).catch(() => {});
});

// Keyboard shortcut handler (Cmd+Shift+A)
chrome.commands.onCommand.addListener(async (command) => {
  if (command === '_execute_action') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      await chrome.sidePanel.open({ tabId: tab.id });
      chrome.tabs.sendMessage(tab.id, { type: 'ACTIVATE_ANNOTATE' }).catch(() => {});
    }
  }
});

// Route messages between content script and side panel
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Forward text selection to side panel
  if (msg.type === 'TEXT_SELECTED') {
    chrome.runtime.sendMessage({ type: 'TEXT_SELECTED', ...msg }).catch(() => {});
  }

  // Forward page detection to side panel
  if (msg.type === 'PAGE_INFO') {
    chrome.runtime.sendMessage({ type: 'PAGE_DETECTED', ...msg }).catch(() => {});
  }

  // Forward post confirmation to side panel
  if (msg.type === 'ANNOTATION_POSTED') {
    chrome.runtime.sendMessage({ type: 'ANNOTATION_POSTED', ...msg }).catch(() => {});
  }
});
