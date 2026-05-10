import { Hono } from 'hono';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import db from '../db.js';

const app = new Hono();

const JWT_SECRET = process.env.JWT_SECRET || 'annotated-dev-secret-change-in-prod';
const JWT_EXPIRY = '7d';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3090';

// --- Google OAuth ---
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT = process.env.GOOGLE_REDIRECT || '/api/auth/google/callback';

app.get('/google', (c) => {
  if (!GOOGLE_CLIENT_ID) {
    // Dev fallback: redirect to demo login
    return c.redirect('/api/auth/demo?provider=google');
  }
  const redirectUri = `${new URL(c.req.url).origin}${GOOGLE_REDIRECT}`;
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
  });
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get('/google/callback', async (c) => {
  const code = c.req.query('code');
  if (!code) return c.json({ error: 'Missing authorization code' }, 400);

  try {
    const redirectUri = `${new URL(c.req.url).origin}${GOOGLE_REDIRECT}`;
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
    return c.redirect(`${FRONTEND_URL}/auth/callback?token=${token}`);
  } catch (err) {
    console.error('Google OAuth error:', err.message);
    return c.redirect(`${FRONTEND_URL}/login?error=google_failed`);
  }
});

// --- X / Twitter OAuth 2.0 (PKCE) ---
const TWITTER_CLIENT_ID = process.env.TWITTER_CLIENT_ID;
const TWITTER_CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET;
const TWITTER_REDIRECT = process.env.TWITTER_REDIRECT || '/api/auth/twitter/callback';

// In-memory PKCE store (swap for Redis in production)
const pkceStore = new Map();

app.get('/twitter', async (c) => {
  if (!TWITTER_CLIENT_ID) {
    return c.redirect('/api/auth/demo?provider=twitter');
  }
  const state = nanoid(16);
  const codeVerifier = nanoid(64);

  // S256 challenge
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  pkceStore.set(state, { codeVerifier, created: Date.now() });
  // Clean old entries
  for (const [k, v] of pkceStore) {
    if (Date.now() - v.created > 600000) pkceStore.delete(k);
  }

  const redirectUri = `${new URL(c.req.url).origin}${TWITTER_REDIRECT}`;
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
    const redirectUri = `${new URL(c.req.url).origin}${TWITTER_REDIRECT}`;
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
    return c.redirect(`${FRONTEND_URL}/auth/callback?token=${token}`);
  } catch (err) {
    console.error('Twitter OAuth error:', err.message);
    return c.redirect(`${FRONTEND_URL}/login?error=twitter_failed`);
  }
});

// --- Demo login (development only) ---
app.get('/demo', (c) => {
  const provider = c.req.query('provider') || 'demo';
  const demoUsers = {
    google: { provider: 'google', provider_id: 'demo-google-1', email: 'maya@annotated.com', display_name: 'Maya Desai', avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=96&q=80', username: 'mayadesai' },
    twitter: { provider: 'twitter', provider_id: 'demo-twitter-1', email: null, display_name: 'Maya Desai', avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=96&q=80', username: 'mayadesai' },
    demo: { provider: 'demo', provider_id: 'demo-1', email: 'maya@annotated.com', display_name: 'Maya Desai', avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=96&q=80', username: 'mayadesai' },
  };

  const profile = demoUsers[provider] || demoUsers.demo;
  const user = upsertUser(profile);
  const token = signToken(user);
  return c.redirect(`${FRONTEND_URL}/auth/callback?token=${token}`);
});

// --- Current user (JWT-protected) ---
app.get('/me', (c) => {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) return c.json({ error: 'Not authenticated' }, 401);

  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET);
    const user = db.prepare('SELECT id, username, display_name, avatar_url, bio, provider, email, created_at FROM users WHERE id = ?').get(payload.sub);
    if (!user) return c.json({ error: 'User not found' }, 404);

    // Stats
    const annotations = db.prepare('SELECT COUNT(*) as count FROM annotations WHERE user_id = ?').get(user.id);
    const followers = db.prepare('SELECT COUNT(*) as count FROM follows WHERE following_id = ?').get(user.id);
    const following = db.prepare('SELECT COUNT(*) as count FROM follows WHERE follower_id = ?').get(user.id);

    return c.json({
      ...user,
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
  const existing = db.prepare('SELECT * FROM users WHERE provider = ? AND provider_id = ?').get(provider, provider_id);

  if (existing) {
    // Update profile on each login
    db.prepare(`UPDATE users SET display_name = ?, avatar_url = ?, email = COALESCE(?, email), updated_at = datetime('now') WHERE id = ?`)
      .run(display_name, avatar_url, email, existing.id);
    return { ...existing, display_name, avatar_url };
  }

  // Dedupe username
  let finalUsername = username || display_name?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';
  const taken = db.prepare('SELECT 1 FROM users WHERE username = ?').get(finalUsername);
  if (taken) finalUsername = `${finalUsername}${nanoid(4)}`;

  const id = nanoid(12);
  db.prepare('INSERT INTO users (id, username, display_name, avatar_url, bio, provider, provider_id, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, finalUsername, display_name, avatar_url, null, provider, provider_id, email);

  return { id, username: finalUsername, display_name, avatar_url, provider };
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

export { JWT_SECRET };
export default app;
