import { Hono } from 'hono';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import db from '../db.js';
import { isAdminUser } from '../lib/admin.js';
import { activeIdentityBan, userUnavailable } from '../lib/moderation.js';

const app = new Hono();

const JWT_SECRET = process.env.JWT_SECRET || 'annotated-dev-secret-change-in-prod';
const JWT_EXPIRY = '7d';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3090';
const DESKTOP_CALLBACK_URL = process.env.DESKTOP_CALLBACK_URL || 'annotated://callback';
const API_PUBLIC_URL = process.env.API_PUBLIC_URL || `http://localhost:${process.env.PORT || 3080}`;
const ALLOW_DEMO_AUTH = process.env.ALLOW_DEMO_AUTH === '1';

// --- Google OAuth ---
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT = process.env.GOOGLE_REDIRECT || '/api/auth/google/callback';

app.get('/google', (c) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return oauthNotConfigured(c, 'google');
  }
  const redirectUri = oauthRedirectUri(GOOGLE_REDIRECT);
  const client = c.req.query('client') === 'desktop' ? 'desktop' : 'web';
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
    state: client,
  });
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get('/google/callback', async (c) => {
  const code = c.req.query('code');
  const client = c.req.query('state') === 'desktop' ? 'desktop' : 'web';
  if (!code) return c.json({ error: 'Missing authorization code' }, 400);

  try {
    const redirectUri = oauthRedirectUri(GOOGLE_REDIRECT);
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenRes.json();
    if (tokens.error) throw new Error(tokens.error_description || tokens.error);

    // Get user info
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await userRes.json();

    const user = upsertUser({
      provider: 'google',
      provider_id: profile.id,
      email: profile.email,
      display_name: profile.name,
      avatar_url: profile.picture,
      username: profile.email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase(),
    });

    const token = signToken(user);
    return c.redirect(callbackTarget(token, client));
  } catch (err) {
    console.error('Google OAuth error:', err.message);
    return c.redirect(`${FRONTEND_URL}/login?error=${err.code === 'ACCOUNT_BANNED' ? 'account_banned' : 'google_failed'}`);
  }
});

// --- X / Twitter OAuth 2.0 (PKCE) ---
const TWITTER_CLIENT_ID = process.env.TWITTER_CLIENT_ID || process.env.X_CLIENT_ID;
const TWITTER_CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET || process.env.X_CLIENT_SECRET;
const TWITTER_REDIRECT = process.env.TWITTER_REDIRECT || process.env.X_REDIRECT || '/api/auth/twitter/callback';

// In-memory PKCE store (swap for Redis in production)
const pkceStore = new Map();

app.get('/twitter', async (c) => {
  if (!TWITTER_CLIENT_ID || !TWITTER_CLIENT_SECRET) {
    return oauthNotConfigured(c, 'twitter');
  }
  const state = nanoid(16);
  const codeVerifier = nanoid(64);
  const client = c.req.query('client') === 'desktop' ? 'desktop' : 'web';

  // S256 challenge
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  pkceStore.set(state, { codeVerifier, client, created: Date.now() });
  // Clean old entries
  for (const [k, v] of pkceStore) {
    if (Date.now() - v.created > 600000) pkceStore.delete(k);
  }

  const redirectUri = oauthRedirectUri(TWITTER_REDIRECT);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: TWITTER_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: 'tweet.read users.read offline.access',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return c.redirect(`https://twitter.com/i/oauth2/authorize?${params}`);
});

app.get('/twitter/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  if (!code || !state) return c.json({ error: 'Missing code or state' }, 400);

  const pkce = pkceStore.get(state);
  if (!pkce) return c.json({ error: 'Invalid state — try again' }, 400);
  pkceStore.delete(state);

  try {
    const redirectUri = oauthRedirectUri(TWITTER_REDIRECT);
    const basic = btoa(`${TWITTER_CLIENT_ID}:${TWITTER_CLIENT_SECRET}`);
    const tokenRes = await fetch('https://api.x.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basic}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code_verifier: pkce.codeVerifier,
      }),
    });
    const tokens = await tokenRes.json();
    if (tokens.error) throw new Error(tokens.error_description || tokens.error);

    const userRes = await fetch('https://api.x.com/2/users/me?user.fields=profile_image_url,description', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const { data: profile } = await userRes.json();

    const user = upsertUser({
      provider: 'twitter',
      provider_id: profile.id,
      email: null,
      display_name: profile.name,
      avatar_url: profile.profile_image_url?.replace('_normal', '') || null,
      username: profile.username,
    });

    const token = signToken(user);
    return c.redirect(callbackTarget(token, pkce.client));
  } catch (err) {
    console.error('Twitter OAuth error:', err.message);
    return c.redirect(`${FRONTEND_URL}/login?error=${err.code === 'ACCOUNT_BANNED' ? 'account_banned' : 'twitter_failed'}`);
  }
});

// --- Demo login (development only) ---
app.get('/demo', (c) => {
  if (!ALLOW_DEMO_AUTH) {
    return c.json({ error: 'Demo auth is disabled' }, 404);
  }
  const provider = c.req.query('provider') || 'demo';
  const client = c.req.query('client') === 'desktop' ? 'desktop' : 'web';
  const demoUsers = {
    google: { provider: 'google', provider_id: 'demo-google-1', email: 'maya@annotated.com', display_name: 'Maya Desai', avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=96&q=80', username: 'mayadesai' },
    twitter: { provider: 'twitter', provider_id: 'demo-twitter-1', email: null, display_name: 'Maya Desai', avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=96&q=80', username: 'mayadesai' },
    demo: { provider: 'demo', provider_id: 'demo-1', email: 'maya@annotated.com', display_name: 'Maya Desai', avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=96&q=80', username: 'mayadesai' },
  };

  const profile = demoUsers[provider] || demoUsers.demo;
  const user = upsertUser(profile);
  const token = signToken(user);
  return c.redirect(callbackTarget(token, client));
});

// --- Current user (JWT-protected) ---
app.get('/me', (c) => {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) return c.json({ error: 'Not authenticated' }, 401);

  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET);
    const user = reconcileUsername(db.prepare('SELECT id, username, display_name, avatar_url, bio, link, twitter_handle, age, onboarding_completed, subscription_tier, provider, email, blocked, blocked_until, deleted_at, created_at FROM users WHERE id = ?').get(payload.sub));
    if (!user) return c.json({ error: 'User not found' }, 404);
    if (userUnavailable(user)) return c.json({ error: 'Account unavailable' }, 403);

    // Stats
    const annotations = db.prepare("SELECT COUNT(*) as count FROM annotations WHERE user_id = ? AND status = 'published'").get(user.id);
    const followers = db.prepare('SELECT COUNT(*) as count FROM follows WHERE following_id = ?').get(user.id);
    const following = db.prepare('SELECT COUNT(*) as count FROM follows WHERE follower_id = ?').get(user.id);

    return c.json({
      ...user,
      onboarding_completed: Boolean(user.onboarding_completed),
      is_admin: isAdminUser(user),
      stats: {
        annotations: annotations.count,
        followers: followers.count,
        following: following.count,
      },
    });
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }
});

// --- Logout hint ---
app.post('/logout', (c) => {
  // JWT is stateless — client just deletes the token
  // This endpoint exists for completeness
  return c.json({ ok: true });
});

// --- Helpers ---

function upsertUser({ provider, provider_id, email, display_name, avatar_url, username }) {
  const ban = activeIdentityBan({ provider, provider_id, email, username });
  if (ban) {
    const error = new Error('Account is temporarily banned');
    error.code = 'ACCOUNT_BANNED';
    error.banned_until = ban.banned_until;
    throw error;
  }

  const existing = db.prepare('SELECT * FROM users WHERE provider = ? AND provider_id = ?').get(provider, provider_id);

  if (existing) {
    if (userUnavailable(existing)) {
      const error = new Error('Account is unavailable');
      error.code = 'ACCOUNT_BANNED';
      throw error;
    }
    const normalizedExistingUsername = normalizeUsername(existing.username || username || display_name || 'user');
    const hasCaseCollision = usernameTakenByOther(normalizedExistingUsername, existing.id);
    const nextUsername = hasCaseCollision && !isAdminUser(existing)
      ? suggestUsername(normalizedExistingUsername)
      : normalizedExistingUsername;
    // Update profile on each login
    db.prepare(`UPDATE users SET username = ?, display_name = ?, avatar_url = ?, email = COALESCE(?, email), updated_at = datetime('now') WHERE id = ?`)
      .run(nextUsername, display_name, avatar_url, email, existing.id);
    return { ...existing, username: nextUsername, display_name, avatar_url };
  }

  const preferredUsername = normalizeUsername(username || display_name || 'user');
  const finalUsername = usernameTaken(preferredUsername)
    ? suggestUsername(preferredUsername)
    : preferredUsername;

  const id = nanoid(12);
  db.prepare('INSERT INTO users (id, username, display_name, avatar_url, bio, provider, provider_id, email, onboarding_completed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)')
    .run(id, finalUsername, display_name, avatar_url, null, provider, provider_id, email);

  return { id, username: finalUsername, display_name, avatar_url, provider, subscription_tier: 'free', onboarding_completed: 0 };
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

function normalizeUsername(value) {
  const base = String(value || 'user')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20) || 'user';
  return base.length >= 3 ? base : `${base}user`.slice(0, 20);
}

function usernameTaken(username) {
  return Boolean(db.prepare('SELECT 1 FROM users WHERE lower(username) = lower(?)').get(username));
}

function usernameTakenByOther(username, userId) {
  return Boolean(db.prepare('SELECT 1 FROM users WHERE lower(username) = lower(?) AND id != ?').get(username, userId));
}

function reconcileUsername(user) {
  if (!user) return null;
  const preferredUsername = normalizeUsername(user.username || 'user');
  const hasCaseCollision = usernameTakenByOther(preferredUsername, user.id);
  const nextUsername = hasCaseCollision && !isAdminUser(user)
    ? suggestUsername(preferredUsername)
    : preferredUsername;

  if (nextUsername === user.username) return user;
  db.prepare('UPDATE users SET username = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(nextUsername, user.id);
  return { ...user, username: nextUsername };
}

function suggestUsername(value) {
  const base = normalizeUsername(value).slice(0, 18);
  for (let index = 1; index < 1000; index += 1) {
    const suffix = `_${index}`;
    const candidate = `${base.slice(0, 20 - suffix.length)}${suffix}`;
    if (!usernameTaken(candidate)) return candidate;
  }
  return `${base}_${nanoid(4).toLowerCase()}`;
}

function callbackTarget(token, client = 'web') {
  if (client === 'desktop') {
    return `${DESKTOP_CALLBACK_URL}?token=${encodeURIComponent(token)}`;
  }
  return `${FRONTEND_URL}/auth/callback?token=${encodeURIComponent(token)}`;
}

function oauthNotConfigured(c, provider) {
  const client = c.req.query('client') === 'desktop' ? 'desktop' : 'web';
  if (client === 'desktop') {
    return c.json({ error: `${provider} OAuth is not configured` }, 503);
  }
  return c.redirect(`${FRONTEND_URL}/login?error=${provider}_not_configured`);
}

function oauthRedirectUri(pathOrUrl) {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const origin = API_PUBLIC_URL.replace(/\/$/, '');
  const path = String(pathOrUrl || '').startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${origin}${path}`;
}

export { JWT_SECRET };
export default app;
