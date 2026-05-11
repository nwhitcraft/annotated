const API_BASE = '/api';
const TOKEN_KEY = 'annotated.jwt';
const USER_ID_KEY = 'annotated.user_id';
const USERNAME_KEY = 'annotated.username';
const AVATAR_URL_KEY = 'annotated.avatar_url';

export function getToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}

export function getCurrentUserId() {
  return window.localStorage.getItem(USER_ID_KEY) || 'demo-user';
}

export function setCurrentUserId(userId) {
  if (userId) window.localStorage.setItem(USER_ID_KEY, userId);
}

export function getUsername() {
  return window.localStorage.getItem(USERNAME_KEY);
}

export function setUsername(username) {
  if (username) window.localStorage.setItem(USERNAME_KEY, username);
}

export function getAvatarUrl() {
  return window.localStorage.getItem(AVATAR_URL_KEY);
}

export function setAvatarUrl(avatarUrl) {
  if (avatarUrl) window.localStorage.setItem(AVATAR_URL_KEY, avatarUrl);
}

export function authUrl(provider) {
  return `${API_BASE}/auth/${provider}`;
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = new Headers(options.headers || {});

  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) throw new Error(data?.error || `Request failed: ${response.status}`);
  return data;
}

export async function getFeed(tab) {
  let path = '/feed';
  if (tab === 'trending') path = '/feed/trending';
  if (['article', 'youtube', 'podcast'].includes(tab)) path = `/feed?type=${tab}`;
  if (tab === 'following') path = `/feed/following/${encodeURIComponent(getCurrentUserId())}`;
  const data = await request(path);
  return data.items || data.annotations || data || [];
}

export async function getAnnotation(id) {
  const data = await request(`/annotations/${encodeURIComponent(id)}`);
  return { ...data, comments: data.comments || [] };
}

export async function getUser(usernameOrId) {
  return request(`/users/${encodeURIComponent(usernameOrId)}`);
}

export async function searchUsers(query) {
  const term = query.trim().replace(/^@/, '');
  if (term.length < 2) return [];
  try {
    const exact = await getUser(term);
    return exact ? [exact] : [];
  } catch {
    return [];
  }
}

export async function getUserAnnotations(userId, tab) {
  const data = await request(`/users/${encodeURIComponent(userId)}/annotations`);
  const items = data.items || data.annotations || [];
  return tab === 'liked' ? [...items].reverse() : items;
}

export async function toggleLike(id) {
  return request(`/annotations/${encodeURIComponent(id)}/like`, {
    method: 'POST',
    body: JSON.stringify({ user_id: getCurrentUserId() }),
  });
}

export async function postComment(annotationId, body, parentId) {
  return request(`/annotations/${encodeURIComponent(annotationId)}/comments`, {
    method: 'POST',
    body: JSON.stringify({
      user_id: getCurrentUserId(),
      body,
      parent_id: parentId || undefined,
    }),
  });
}

export async function toggleFollow(userId) {
  return request(`/users/${encodeURIComponent(userId)}/follow`, {
    method: 'POST',
    body: JSON.stringify({ user_id: getCurrentUserId() }),
  });
}

export async function detectClip(url) {
  const data = await request('/clip/detect', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });

  if (data.type !== 'article') return data;

  try {
    const article = await request('/clip/article', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
    return { ...data, ...article };
  } catch {
    return data;
  }
}

export async function createAnnotation(payload) {
  return request('/annotations', {
    method: 'POST',
    body: JSON.stringify({ user_id: getCurrentUserId(), ...payload }),
  });
}
