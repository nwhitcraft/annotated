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
  const host = parsed.hostname.replace(/^www\./, '');

  // YouTube: try video title from URL params, fallback to slug
  if (/youtube\.com|youtu\.be/.test(host)) {
    const videoId = parsed.searchParams.get('v');
    if (videoId) {
      return `YouTube video (${videoId})`;
    }
    const slug = parsed.pathname.split('/').filter(Boolean).pop();
    if (slug) {
      return decodeURIComponent(slug)
        .replace(/[-_]+/g, ' ')
        .replace(/\.\w+$/, '')
        .replace(/\b\w/g, (char) => char.toUpperCase());
    }
    return 'YouTube video';
  }

  // Vimeo
  if (/vimeo\.com/.test(host)) {
    const videoId = parsed.pathname.split('/').filter(Boolean).pop();
    if (videoId && /^\d+$/.test(videoId)) {
      return `Vimeo video (${videoId})`;
    }
  }

  // Podcasts: try to extract show/episode from path
  if (/spotify\.com|podcasts\.apple\.com|overcast\.fm|pocketcasts|podbean|anchor\.fm/.test(host)) {
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length > 0) {
      return decodeURIComponent(parts.join(' '))
        .replace(/[-_]+/g, ' ')
        .replace(/\.\w+$/, '')
        .replace(/\b\w/g, (char) => char.toUpperCase());
    }
    return `${host} podcast`;
  }

  // Default: slug-to-title
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
