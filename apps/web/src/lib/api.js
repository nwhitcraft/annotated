const API_ORIGIN = import.meta.env.VITE_API_BASE || '';
const API_BASE = `${API_ORIGIN}/api`;
const TOKEN_KEY = 'annotated.jwt';
const USER_ID_KEY = 'annotated.user_id';
const USERNAME_KEY = 'annotated.username';
const AVATAR_URL_KEY = 'annotated.avatar_url';
const DISPLAY_NAME_KEY = 'annotated.display_name';
const SUBSCRIPTION_TIER_KEY = 'annotated.subscription_tier';

export function getToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_ID_KEY);
  window.localStorage.removeItem(USERNAME_KEY);
  window.localStorage.removeItem(AVATAR_URL_KEY);
  window.localStorage.removeItem(DISPLAY_NAME_KEY);
  window.localStorage.removeItem(SUBSCRIPTION_TIER_KEY);
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

export function getDisplayName() {
  return window.localStorage.getItem(DISPLAY_NAME_KEY);
}

export function setDisplayName(displayName) {
  if (displayName) window.localStorage.setItem(DISPLAY_NAME_KEY, displayName);
}

export function getAvatarUrl() {
  return window.localStorage.getItem(AVATAR_URL_KEY);
}

export function setAvatarUrl(avatarUrl) {
  if (avatarUrl) window.localStorage.setItem(AVATAR_URL_KEY, avatarUrl);
}

export function getSubscriptionTier() {
  return window.localStorage.getItem(SUBSCRIPTION_TIER_KEY) || 'free';
}

export function setSubscriptionTier(tier) {
  window.localStorage.setItem(SUBSCRIPTION_TIER_KEY, tier || 'free');
}

export function isPaidTier(tier = getSubscriptionTier()) {
  return !['free', 'starter'].includes(String(tier || 'free').toLowerCase());
}

export function authUrl(provider) {
  return `${API_BASE}/auth/${provider}`;
}

export async function hydrateCurrentUser() {
  const user = await request('/users/me');
  cacheUser(user);
  return user;
}

export async function checkAuth() {
  try {
    const user = await request('/users/me');
    cacheUser(user);
    return { onboardingCompleted: Boolean(user.onboarding_completed), user };
  } catch {
    return { error: 'unauthorized' };
  }
}

function cacheUser(user) {
  setCurrentUserId(user.id);
  setUsername(user.username);
  setDisplayName(user.display_name);
  setAvatarUrl(user.avatar_url);
  setSubscriptionTier(user.subscription_tier);
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
  if (['article', 'youtube', 'podcast', 'twitter'].includes(tab)) path = `/feed?type=${tab}`;
  if (tab?.startsWith('tag:')) path = `/feed?annotation_type=${encodeURIComponent(tab.slice(4))}`;
  if (tab === 'following') path = `/feed/following/${encodeURIComponent(getCurrentUserId())}`;
  const data = await request(path);
  return data.items || data.annotations || data || [];
}

export async function getAnnotation(id) {
  const params = new URLSearchParams({ viewer_id: getCurrentUserId() });
  const data = await request(`/annotations/${encodeURIComponent(id)}?${params}`);
  return { ...data, comments: data.comments || [] };
}

export async function getUser(usernameOrId) {
  return request(`/users/${encodeURIComponent(usernameOrId)}?viewer_id=${encodeURIComponent(getCurrentUserId())}`);
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
  const params = new URLSearchParams({ viewer_id: getCurrentUserId() });
  if (tab === 'drafts') params.set('status', 'draft');
  else if (tab === 'removed') params.set('status', 'removed');
  else params.set('status', 'published');
  if (tab === 'liked') params.set('liked', '1');

  const data = await request(`/users/${encodeURIComponent(userId)}/annotations?${params}`);
  const items = data.items || data.annotations || [];
  return items;
}

export async function toggleLike(id) {
  return request(`/annotations/${encodeURIComponent(id)}/like`, {
    method: 'POST',
    body: JSON.stringify({ user_id: getCurrentUserId() }),
  });
}

export async function toggleNoteworthy(id) {
  return request(`/annotations/${encodeURIComponent(id)}/noteworthy`, {
    method: 'POST',
    body: JSON.stringify({ user_id: getCurrentUserId() }),
  });
}

export async function getAnnotationClaims(id) {
  return request(`/annotations/${encodeURIComponent(id)}/claims`);
}

export async function fileClaim(annotationId, payload) {
  return request('/claims', {
    method: 'POST',
    body: JSON.stringify({
      annotation_id: annotationId,
      claimant_email: payload.claimant_email || payload.email,
      reason_code: payload.reason_code || payload.reason || 'other',
      description: payload.description || payload.details || payload.reason || 'Claim filed from annotation page',
    }),
  });
}

export async function getClaims(status = 'pending') {
  return request(`/claims?status=${encodeURIComponent(status)}`);
}

export async function updateClaim(id, status) {
  return request(`/claims/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function deleteClaim(id) {
  return request(`/claims/${encodeURIComponent(id)}`, { method: 'DELETE' });
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

export async function updateProfile(userId, payload) {
  const data = await request(`/users/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  setUsername(data.username);
  setDisplayName(data.display_name);
  setAvatarUrl(data.avatar_url);
  return data;
}

export async function checkUsername(username) {
  return request('/users/username/check', {
    method: 'POST',
    body: JSON.stringify({ username }),
  });
}

export async function onboardUser(payload) {
  const data = await request('/users/onboard', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  cacheUser(data);
  return data;
}

export async function uploadAvatar(file, userId = getCurrentUserId()) {
  const body = new FormData();
  body.append('avatar', file);
  if (userId) body.append('user_id', userId);
  const data = await request('/users/avatar', {
    method: 'POST',
    body,
  });
  if (data.avatar_url) setAvatarUrl(data.avatar_url);
  return data;
}

export async function detectClip(url) {
  const data = await request('/clip/detect', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });

  if (data.type === 'twitter') {
    try {
      const tweet = await request('/clip/twitter', {
        method: 'POST',
        body: JSON.stringify({ url }),
      });
      return { ...data, ...tweet };
    } catch {
      return data;
    }
  }

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

export async function createMediaClip({ type, url, start, end }) {
  if (!['youtube', 'podcast'].includes(type)) return null;
  return request(`/clip/${type}`, {
    method: 'POST',
    body: JSON.stringify({ url, start, end }),
  });
}

export async function createAnnotation(payload) {
  return request('/annotations', {
    method: 'POST',
    body: JSON.stringify({ user_id: getCurrentUserId(), ...payload }),
  });
}

export async function getSuggestedUsers() {
  const data = await request('/users/suggested');
  return data.items || [];
}

export { API_ORIGIN, API_BASE };
