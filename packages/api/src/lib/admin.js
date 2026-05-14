const ADMIN_USERNAMES = new Set(parseList(process.env.ADMIN_USERNAMES || 'nwhitcraft,demo'));
const ADMIN_USER_IDS = new Set(parseList(process.env.ADMIN_USER_IDS));
const ADMIN_EMAILS = new Set(parseList(process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL).map((value) => value.toLowerCase()));

export function isAdminUser(user) {
  if (!user) return false;
  const username = String(user.username || '').trim();
  const email = String(user.email || '').trim().toLowerCase();
  return Boolean(
    ADMIN_USER_IDS.has(String(user.id || '').trim())
      || (email && ADMIN_EMAILS.has(email))
      || (username && ADMIN_USERNAMES.has(username))
  );
}

function parseList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
