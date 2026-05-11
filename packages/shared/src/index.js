// Source type detection
export function detectSourceType(url) {
  if (!url) return 'article';
  if (/youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts/i.test(url)) return 'youtube';
  if (/twitter\.com|x\.com/i.test(url)) return 'twitter';
  if (/spotify\.com|podcasts\.apple\.com|soundcloud\.com|overcast\.fm|pca\.st|pocketcasts|castro\.fm|castbox|podbean|anchor\.fm|podcasts\.google/i.test(url)) return 'podcast';
  if (/\.mp3$|\.m4a$|\.wav$|\/audio\//i.test(url)) return 'podcast';
  return 'article';
}

// Extract domain from URL
export function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

// Time formatting
export function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatTimestamp(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Relative time
export function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

// Validate clip range
export function validateClipRange(start, end, maxDuration = 90) {
  const s = Number(start) || 0;
  const e = Number(end) || 0;
  if (e <= s) return { valid: false, error: 'End must be after start' };
  if (e - s > maxDuration) return { valid: false, error: `Clip cannot exceed ${maxDuration}s` };
  return { valid: true, start: s, end: e, duration: e - s };
}
