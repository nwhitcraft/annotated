# CODEX Work Plan — 13 May 2026

## Overview

Remaining implementation tasks to reach bounty-submission readiness. Each task includes the exact files to modify, the behavior expected, and style constraints so every change matches the existing newspaper-editorial design system.

**Design tokens (reference only — already in `apps/web/src/styles/global.css`):**
- `--bg-primary: #fafaf8` · `--bg-surface: #f7f7f5` · `--bg-hover: #f0f0ee`
- `--border: #deded9` · `--border-subtle: #eeeeec`
- `--text-primary: #1a1a1a` · `--text-secondary: #6b6b6b` · `--text-tertiary: #999999`
- `--accent: #6366f1` · `--accent-hover: #4f46e5` · `--danger: #dc2626`
- `--font-serif: "Newsreader"` · `--font-sans: "Inter"`
- `--content-width: 680px` · `--header-width: 812px`

**Button precedent:** `.button-text` for low-emphasis actions (font-size 13px, `--text-secondary` color). `.button-outline` for medium emphasis. `.button-solid` for primary actions.

---

## Task 1 — Logout Button (Web)

### Goal
Add a "Sign out" action on the **user's own profile page only**. No logout button in the header or elsewhere.

### How to detect "own profile"
Compare the `username` route param against the currently authenticated user from localStorage:
```js
import { getUsername, getCurrentUserId } from '../lib/api.js';

// Inside Profile component:
const isOwnProfile = user && (
  user.username === getUsername() ||
  user.id === getCurrentUserId()
);
```

### Sign-out function
`api.js` already has `clearToken()`. Add a full `signOut()` helper:

**File: `apps/web/src/lib/api.js`** — add export:
```js
export function signOut() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_ID_KEY);
  window.localStorage.removeItem(USERNAME_KEY);
  window.localStorage.removeItem(AVATAR_URL_KEY);
}
```

### Profile page change

**File: `apps/web/src/pages/Profile.jsx`**

Add the sign-out button below the profile stats, only when `isOwnProfile` is true. Use the `useNavigate` hook to redirect after sign-out.

```jsx
import { useNavigate, useParams } from 'react-router-dom';
import { getUsername, getCurrentUserId, signOut } from '../lib/api.js';

// Inside the component:
const navigate = useNavigate();
const isOwnProfile = user && (
  user.username === getUsername() ||
  user.id === getCurrentUserId()
);

function handleSignOut() {
  signOut();
  navigate('/login', { replace: true });
}
```

In the JSX, after the `<p className="profile-stats">` block and inside the `<section className="profile-header">`:
```jsx
{isOwnProfile && (
  <button className="sign-out-link" onClick={handleSignOut}>Sign out</button>
)}
```

When `isOwnProfile` is true, also hide or replace the "Follow / Following" button — you don't follow yourself.

### CSS

**File: `apps/web/src/styles/global.css`** — add near the `.profile-stats` rules:

```css
.sign-out-link {
  grid-column: 1 / -1;
  width: fit-content;
  padding: 0;
  border: 0;
  border-bottom: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-family: var(--font-sans);
  cursor: pointer;
}

.sign-out-link:hover {
  color: var(--danger);
  border-bottom-color: var(--danger);
}
```

This matches the understated, ruled-line editorial style — a subtle text link with a bottom border that turns red on hover, consistent with how `.follow-mini` and `.button-text` are styled elsewhere.

---

## Task 2 — Swap Mock `currentUser` for Real Auth State (Web)

### Problem
`Layout.jsx` imports `currentUser` from `mockData.js` (hardcoded as "Maya Desai"). The header avatar and profile link always show the mock user.

### Solution

**File: `apps/web/src/components/Layout.jsx`**

Replace the mock import with real auth from localStorage:

```jsx
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import UserAvatar from './UserAvatar.jsx';
import UserSearch from './UserSearch.jsx';
import { getUsername, getAvatarUrl, getCurrentUserId, getToken } from '../lib/api.js';

export default function Layout() {
  const token = getToken();
  const username = getUsername();
  const avatarUrl = getAvatarUrl();
  const userId = getCurrentUserId();

  const user = token ? {
    id: userId,
    username: username || userId,
    display_name: username || 'User',
    avatar_url: avatarUrl || '',
  } : null;

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="site-header-inner">
          <Link className="wordmark" to="/">annotated</Link>
          <nav className="main-nav" aria-label="Primary navigation">
            <NavLink to="/" end>Feed</NavLink>
            <NavLink to="/new">Annotate</NavLink>
            {user && <NavLink to={`/u/${user.username}`}>Profile</NavLink>}
          </nav>
          <div className="header-tools">
            <UserSearch />
            {user ? (
              <Link to={`/u/${user.username}`} className="avatar-link" aria-label="Account">
                <UserAvatar user={user} size="sm" />
              </Link>
            ) : (
              <Link to="/login" className="avatar-link" aria-label="Sign in">
                <span className="avatar avatar-sm">?</span>
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="site-main">
        <Outlet />
      </main>
    </div>
  );
}
```

Key changes:
- No more `mockData` import
- Header shows real avatar or "?" fallback when not signed in
- Profile nav link only shows when authenticated
- Profile link goes to the real username, not hardcoded "maya"

### Also update any other files importing `currentUser` from mockData

Check for other imports:
```bash
grep -rn "currentUser" apps/web/src/ --include="*.jsx" --include="*.js"
```

Any file still using `import { currentUser } from '../lib/mockData.js'` should be updated to use the `api.js` getters instead.

---

## Task 3 — Logout Button (Desktop App)

### Goal
Add sign-out to the desktop Tauri app. Since the desktop has a sidebar with views (Compose, Library, Detail, Settings), add the sign-out in **Settings view** — consistent with most desktop apps.

### Implementation

**File: `apps/desktop/src/components/SettingsView.jsx`**

Add an "Account" section at the bottom of SettingsView with a sign-out button:

```jsx
export default function SettingsView({ settings, onChange, onSave, onSignOut }) {
  return (
    <section className="settings-view">
      <header className="section-heading">
        <div>
          <p>Settings</p>
          <h2>Local workspace</h2>
        </div>
      </header>
      <label>
        API endpoint
        <input value={settings.apiEndpoint || ''} onChange={(event) => onChange({ ...settings, apiEndpoint: event.target.value })} />
      </label>
      <label>
        Global hotkey
        <input value={settings.hotkey || ''} onChange={(event) => onChange({ ...settings, hotkey: event.target.value })} />
      </label>
      <label>
        Storage location
        <input value={settings.storageLocation || ''} onChange={(event) => onChange({ ...settings, storageLocation: event.target.value })} />
      </label>
      <p className="schema-note">
        Local schema mirrors the web API annotations, users, comments, likes, pins and follows tables, with synced_at and conflict_version on locally mutable records.
      </p>
      <button className="button button-solid" onClick={() => onSave(settings)}>Save settings</button>

      <div className="settings-divider" />

      <div className="settings-account">
        <h3>Account</h3>
        <p className="settings-account-note">Signing out clears your local session. Your annotations remain saved locally.</p>
        <button className="button button-text sign-out-desktop" onClick={onSignOut}>Sign out</button>
      </div>
    </section>
  );
}
```

**File: `apps/desktop/src/App.jsx`**

Add the sign-out handler and pass it to SettingsView:

```jsx
function handleSignOut() {
  window.localStorage.removeItem('annotated.jwt');
  window.localStorage.removeItem('annotated.user_id');
  window.localStorage.removeItem('annotated.username');
  window.localStorage.removeItem('annotated.avatar_url');
  setStatus('Signed out');
  // Optionally redirect to compose view
  setActiveView('compose');
}

// In the JSX:
{activeView === 'settings' && (
  <SettingsView
    settings={settings}
    onChange={setSettings}
    onSave={async (value) => { await saveSettings(value); setStatus('Settings saved'); }}
    onSignOut={handleSignOut}
  />
)}
```

### Desktop CSS

Add to the desktop stylesheet (or inline if the desktop uses inline styles):

```css
.settings-divider {
  margin: 28px 0;
  border-top: 1px solid var(--border);
}

.settings-account h3 {
  margin: 0 0 6px;
  font-family: var(--font-serif);
  font-size: 19px;
  font-weight: 400;
}

.settings-account-note {
  margin: 0 0 14px;
  color: var(--text-secondary);
  font-size: 13px;
}

.sign-out-desktop {
  color: var(--text-secondary);
  font-size: 13px;
}

.sign-out-desktop:hover {
  color: var(--danger);
}
```

---

## ~~Task 4 — Audio Commentary~~ REMOVED

> **Cut from sprint.** Audio commentary is not in Jason's bounty spec — it came from competitive analysis of ByteTalk. Not worth the implementation time for bounty submission. Can revisit post-launch.

---

## Task 4 — Desktop App Download Page

### Goal
Replace the subscription/Stripe plan with a simple download page. Stripe requires a registered business address which is not available, so the desktop app is **free for now** with a clear, honest, on-brand message.

### Route
Add route `/download` to the web app.

### New page: `apps/web/src/pages/Download.jsx`

```jsx
import { Link } from 'react-router-dom';

export default function Download() {
  return (
    <section className="download-page">
      <header className="download-header">
        <h1>Get the desktop app</h1>
        <p className="download-subhead">
          Good news — it's free for you today. We can't set up Stripe
          payments at this time, so the full desktop experience is on us.
          Enjoy.
        </p>
      </header>

      <div className="download-body">
        <div className="download-card">
          <h2>Annotated for Mac</h2>
          <p>Full media pipeline — clip articles, YouTube, podcasts.
          Screen-level capture. Local-first storage. AI summaries.</p>
          <a
            href="/downloads/Annotated.dmg"
            className="button button-solid download-btn"
            download
          >
            Download for macOS
          </a>
          <p className="download-meta">Requires macOS 13 Ventura or later · Apple Silicon &amp; Intel</p>
        </div>

        <div className="download-note">
          <p>
            The desktop app is where the full power lives — yt-dlp, ffmpeg,
            Whisper transcription, screen capture, and offline-first
            annotation storage. The web and extension cover reading and
            quick annotations; the desktop covers everything else.
          </p>
        </div>
      </div>

      <footer className="download-footer">
        <Link to="/" className="button-text">← Back to feed</Link>
      </footer>
    </section>
  );
}
```

### Register the route

**File: `apps/web/src/App.jsx`**

Add the import and route:
```jsx
import Download from './pages/Download.jsx';

// Inside the Routes:
<Route path="/download" element={<Download />} />
```

### Add nav link (optional)

**File: `apps/web/src/components/Layout.jsx`**

Add a "Download" link to the header nav (after "Annotate"):
```jsx
<NavLink to="/download">Desktop</NavLink>
```

### CSS

**File: `apps/web/src/styles/global.css`** — append:

```css
/* ── Download Page ───────────────────────────────────────────── */

.download-page {
  max-width: var(--content-width);
  margin: 0 auto;
  padding: 48px 0 80px;
}

.download-header {
  padding-bottom: 28px;
  border-bottom: 1px solid var(--border);
}

.download-header h1 {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 42px;
  font-weight: 400;
  line-height: 1;
}

.download-subhead {
  margin: 12px 0 0;
  max-width: 520px;
  font-family: var(--font-serif);
  font-size: 19px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.download-body {
  padding: 32px 0;
}

.download-card {
  padding: 28px 0;
  border-bottom: 1px solid var(--border);
}

.download-card h2 {
  margin: 0 0 8px;
  font-family: var(--font-serif);
  font-size: 24px;
  font-weight: 400;
}

.download-card p {
  margin: 0 0 20px;
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.5;
  max-width: 480px;
}

.download-btn {
  display: inline-flex;
  font-size: 15px;
}

.download-meta {
  margin: 12px 0 0 !important;
  font-size: 12px !important;
  color: var(--text-tertiary) !important;
}

.download-note {
  padding: 24px 0;
}

.download-note p {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 16px;
  line-height: 1.6;
  color: var(--text-secondary);
  max-width: 520px;
}

.download-footer {
  padding-top: 28px;
  border-top: 1px solid var(--border);
}
```

This matches the existing newspaper-editorial style — large serif heading, understated subhead, ruled-line sections, plenty of whitespace. The "free for now" message is upfront, honest, and feels editorial rather than apologetic.

### Placeholder DMG

Create directory `apps/web/public/downloads/` and put a placeholder file there. The actual `.dmg` will come from the Tauri build (`npm run tauri build` in `apps/desktop/`). For now, either:
- Put a placeholder `README.txt` explaining the build isn't ready
- Or point the href to a GitHub releases URL instead: `https://github.com/nicholaswhitcraft/annotated/releases/latest`

---

## Task 5 — X / Twitter OAuth (Nice-to-Have)

### Goal
Wire up `/api/auth/twitter` backend route using Twitter OAuth 2.0 PKCE flow.

### Notes
- Follow the same pattern as the Google OAuth route that is already working
- After callback, issue JWT and redirect to `/login?token=...&user_id=...&username=...`
- Frontend `Login.jsx` already handles the redirect params — no frontend changes needed
- Requires Twitter Developer account API keys in environment variables

### Priority
Lower priority than Tasks 1–4. If time permits before submission.

---

## Task 6 — Fly.io Deployment

### Goal
Deploy the monorepo (API + web frontend) to Fly.io for a live bounty-submission URL.

### Steps
1. Create `fly.toml` in the project root
2. Build the web frontend (`npm run build` in `apps/web/`)
3. Serve the built frontend as static files from the Hono API server
4. Configure SQLite volume for persistent data
5. Set environment variables (OAuth secrets, JWT secret)
6. Deploy with `fly deploy`
7. Verify: login flow, feed, annotation creation, profile

### Configuration template

```toml
app = "annotated-app"
primary_region = "sin"  # Singapore — closest to Thailand

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 3080
  force_https = true

[mounts]
  source = "annotated_data"
  destination = "/app/data"
```

---

## Task 7 — Demo Video & Submission

### Goal
Record a 2–3 minute demo showing the full user flow, then submit.

### Demo script
1. Open annotated.com (live Fly.io URL)
2. Sign in with Google
3. Browse the feed — show Latest, Trending, Articles, Videos tabs
4. Create a new annotation — paste a URL, highlight a clip, write commentary
5. Show the annotation on the feed
6. Visit user profile
7. Open the Chrome extension — show annotate mode, text selection, inline post
8. Sign out from profile page
9. Brief look at the editorial design — typography, whitespace, ruled lines

### Submission
- Send demo video + live URL + repo link to `oliver@launch.co`
- Include brief written summary of what was built and the tech stack

---

## Execution Order

| # | Task | Est. Time | Priority |
|---|------|-----------|----------|
| 1 | Logout button (web) | 15 min | 🔴 |
| 2 | Swap mock currentUser | 20 min | 🔴 |
| 3 | Logout button (desktop) | 15 min | 🔴 |
| 4 | Desktop download page | 20 min | 🔴 |
| 5 | X/Twitter OAuth | 45 min | 🟢 |
| 6 | Fly.io deploy | 30–45 min | 🔴 |
| 7 | Demo video + submit | 30 min | 🔴 |
| 8 | Credibility score | 25 min | 🔴 |

🔴 = required for submission · 🟢 = nice-to-have

**Total estimated: 3–3.5 hours of focused work.**

---

## Task 8 — Credibility Score (Quick Build)

### Goal
Add a visible credibility score to every user, displayed on the feed (next to author name) and on profile pages. The score is computed from community engagement — likes and pins received on a user's annotations. This is a key differentiator.

### Formula
```
credibility_score = (total_likes × 1) + (total_pins × 2) + (total_comments × 1)
```

Simple, transparent, and good enough for launch. Pins are weighted 2x because saving something is a stronger signal than a like.

### Display
- **Feed:** Small badge after the author's display name, e.g. `Maya Desai ✦ 47`
- **Profile:** Shown in the stats row alongside followers/following, e.g. `47 credibility · 12 annotations · 8 followers`
- The `✦` symbol is the credibility icon — small, editorial, not gamified-looking

### Backend Changes

#### 8a. Include credibility in existing user profile response

**File: `packages/api/src/routes/users.js`** — modify the `GET /:id` handler:

In the existing `GET /:id` route, after computing `stats`, add credibility computation:

```js
  const cred = db.prepare(`
    SELECT
      COALESCE(SUM(a.like_count), 0) as total_likes,
      COALESCE(SUM(a.pin_count), 0) as total_pins,
      COALESCE(SUM(a.comment_count), 0) as total_comments
    FROM annotations a
    WHERE a.user_id = ?
  `).get(user.id);

  const credibility = (cred.total_likes * 1) + (cred.total_pins * 2) + (cred.total_comments * 1);

  // Update the return to include credibility in stats:
  const { provider_id, email, ...safe } = user;
  return c.json({ ...safe, stats: { ...stats, credibility } });
```

#### 8b. Include credibility in feed responses

**File: `packages/api/src/routes/feed.js`** — modify ALL three feed queries to include a credibility subquery:

Replace the SELECT in each query. Example for the main `GET /` feed:

```js
  let sql = `
    SELECT a.*, u.username, u.display_name, u.avatar_url,
      (SELECT COALESCE(SUM(a2.like_count),0) + COALESCE(SUM(a2.pin_count),0)*2 + COALESCE(SUM(a2.comment_count),0)
       FROM annotations a2 WHERE a2.user_id = u.id) as author_credibility
    FROM annotations a
    JOIN users u ON a.user_id = u.id
    WHERE a.is_public = 1
  `;
```

Do the same for the `GET /following/:userId` and `GET /trending` queries — add the same subquery as `author_credibility`.

### Frontend Changes

#### 8c. Credibility badge in feed items

**File: `apps/web/src/components/AnnotationItem.jsx`**

In the `annotation-meta` div, after the display name Link and before the `@username` span, add:

```jsx
          {annotation.author_credibility > 0 && (
            <span className="credibility-badge" title="Credibility score">
              ✦ {annotation.author_credibility}
            </span>
          )}
```

So the byline reads: `Maya Desai ✦ 47 @maya · nytimes.com · 2h ago`

#### 8d. Credibility on profile page

**File: `apps/web/src/pages/Profile.jsx`**

In the `profile-stats` paragraph, add credibility before annotations:

```jsx
        <p className="profile-stats">
          {user.stats?.credibility > 0 && (
            <><strong>{Number(user.stats.credibility).toLocaleString()}</strong> credibility · </>
          )}
          <strong>{Number(user.stats?.annotations || 0).toLocaleString()}</strong> annotations · <strong>{Number(user.stats?.followers || 0).toLocaleString()}</strong> followers · <strong>{Number(user.stats?.following || 0).toLocaleString()}</strong> following
        </p>
```

#### 8e. CSS for credibility badge

**File: `apps/web/src/styles/global.css`** — append:

```css
/* —— Credibility Badge —————————————————————————————————— */

.credibility-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: 4px;
  padding: 1px 6px;
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-sans);
  color: var(--accent);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 3px;
  letter-spacing: 0.01em;
  white-space: nowrap;
  vertical-align: middle;
  cursor: default;
}
```

### No Migration Needed
The score is computed on the fly from existing `like_count`, `pin_count`, and `comment_count` columns on the `annotations` table. No new DB columns required.
