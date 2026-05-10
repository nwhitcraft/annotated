// Content script — captures text selection and page info

// Detect page type and send info to background
function detectPage() {
  const url = window.location.href;
  let type = 'article';
  if (/youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts/i.test(url)) type = 'youtube';
  else if (/spotify\.com|podcasts\.apple\.com|overcast\.fm/i.test(url)) type = 'podcast';

  chrome.runtime.sendMessage({
    type: 'PAGE_INFO',
    url,
    title: document.title,
    sourceType: type,
    domain: window.location.hostname,
  });
}

// Send selected text when user selects
document.addEventListener('mouseup', () => {
  const text = window.getSelection()?.toString().trim();
  if (text && text.length > 5) {
    chrome.runtime.sendMessage({
      type: 'TEXT_SELECTED',
      text,
      url: window.location.href,
      title: document.title,
    });
  }
});

// Detect on load
detectPage();

// Re-detect on SPA navigation
let lastUrl = window.location.href;
const observer = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    detectPage();
  }
});
observer.observe(document.body, { childList: true, subtree: true });
