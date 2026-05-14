export function timeAgo(value) {
  if (!value) return 'now';
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return 'now';
  const diff = Date.now() - date.getTime();
  const mins = Math.max(0, Math.floor(diff / 60000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d`;
  return date.toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

export function formatAnnotatedAt(value) {
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return 'now';
  return date.toLocaleString('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatTime(seconds = 0) {
  const safe = Math.max(0, Number(seconds) || 0);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function domainFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function parseDate(value) {
  if (!value) return new Date(NaN);
  const normalized = String(value).trim().replace(' ', 'T');
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  return new Date(hasZone ? normalized : `${normalized}Z`);
}
