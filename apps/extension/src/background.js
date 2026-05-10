// Open side panel on action click
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Also support the keyboard shortcut
chrome.commands.onCommand.addListener((command) => {
  if (command === '_execute_action') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.sidePanel.open({ tabId: tabs[0].id });
      }
    });
  }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'TEXT_SELECTED') {
    // Forward to side panel
    chrome.runtime.sendMessage({ type: 'CLIP_TEXT', text: msg.text, url: msg.url, title: msg.title });
  }
  if (msg.type === 'PAGE_INFO') {
    chrome.runtime.sendMessage({ type: 'PAGE_DETECTED', ...msg });
  }
});
