import { currentUser, mockAnnotations, mockComments, mockUser } from './mockData.js';

export const CURRENT_USER_ID = currentUser.id;

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) throw new Error(data?.error || `Request failed: ${response.status}`);
  return data;
}

export async function getFeed(tab) {
  try {
    let path = '/api/feed';
    if (tab === 'trending') path = '/api/feed/trending';
    if (['article', 'youtube', 'podcast'].includes(tab)) path = `/api/feed?type=${tab}`;
    if (tab === 'following') path = `/api/feed/following/${CURRENT_USER_ID}`;
    const data = await request(path);
    return data.items || data.annotations || data || [];
  } catch {
    if (tab === 'trending') return [...mockAnnotations].sort((a, b) => b.like_count - a.like_count);
    if (['article', 'youtube', 'podcast'].includes(tab)) return mockAnnotations.filter((item) => item.source_type === tab);
    if (tab === 'following') return mockAnnotations.slice(0, 2);
    return mockAnnotations;
  }
}

export async function getAnnotation(id) {
  try {
    const data = await request(`/api/annotations/${id}`);
    return { ...data, comments: data.comments || [] };
  } catch {
    const fallback = mockAnnotations.find((item) => item.id === id) || mockAnnotations[0];
    return { ...fallback, comments: mockComments };
  }
}

export async function getUser(username) {
  try {
    return await request(`/api/users/${username}`);
  } catch {
    return { ...mockUser, username: username || mockUser.username };
  }
}

export async function getUserAnnotations(username, tab) {
  try {
    const data = await request(`/api/users/${username}/annotations`);
    const items = data.items || data.annotations || [];
    return tab === 'liked' ? [...items].reverse() : items;
  } catch {
    return tab === 'liked' ? [...mockAnnotations].reverse() : mockAnnotations;
  }
}

export async function toggleLike(id) {
  return request(`/api/annotations/${id}/like`, {
    method: 'POST',
    body: JSON.stringify({ user_id: CURRENT_USER_ID }),
  });
}

export async function postComment(annotationId, body, parentId) {
  try {
    return await request(`/api/annotations/${annotationId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ user_id: CURRENT_USER_ID, body, parent_id: parentId || undefined }),
    });
  } catch {
    return { id: `local-${Date.now()}` };
  }
}

export async function toggleFollow(userId) {
  return request(`/api/users/${userId}/follow`, {
    method: 'POST',
    body: JSON.stringify({ user_id: CURRENT_USER_ID }),
  });
}

export async function detectClip(url) {
  const data = await request('/api/clip/detect', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
  if (data.type !== 'article') return data;
  try {
    const article = await request('/api/clip/article', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
    return { ...data, ...article };
  } catch {
    return data;
  }
}

export async function createAnnotation(payload) {
  return request('/api/annotations', {
    method: 'POST',
    body: JSON.stringify({ user_id: CURRENT_USER_ID, ...payload }),
  });
}
