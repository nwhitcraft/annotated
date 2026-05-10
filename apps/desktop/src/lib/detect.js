export function detectSource(url) {
  const value = url.trim();
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, '');
  const isVideo = /youtube\.com|youtu\.be|vimeo\.com/i.test(host);
  const isPodcast = /spotify\.com|podcasts\.apple\.com|overcast\.fm|pocketcasts|podbean|anchor\.fm/i.test(value);

  return {
    source_url: value,
    source_type: isVideo ? 'youtube' : isPodcast ? 'podcast' : 'article',
    source_domain: host,
    source_title: titleFromUrl(parsed),
  };
}

function titleFromUrl(parsed) {
  const last = parsed.pathname.split('/').filter(Boolean).pop();
  if (!last) return parsed.hostname.replace(/^www\./, '');
  return decodeURIComponent(last)
    .replace(/[-_]+/g, ' ')
    .replace(/\.\w+$/, '')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function typeLabel(type) {
  if (type === 'youtube') return 'video';
  if (type === 'podcast') return 'podcast';
  return 'article';
}

export function parseTags(value) {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function formatDate(value) {
  if (!value) return 'unsynced';
  return new Date(value).toLocaleDateString('en', { month: 'short', day: 'numeric' });
}
