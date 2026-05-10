export function timeAgo(value) {
  if (!value) return 'now';
  const date = new Date(String(value).replace(' ', 'T'));
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

export function formatTime(seconds = 0) {
  const safe = Math.max(0, Number(seconds) || 0);
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  if (hrs > 0) return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function domainFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function plural(count, word) {
  return `${Number(count || 0).toLocaleString()} ${word}${Number(count || 0) === 1 ? '' : 's'}`;
}
