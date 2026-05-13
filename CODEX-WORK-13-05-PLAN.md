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

## Task 4 — Audio Commentary Recording & Playback

### Spec (from CODEX-SPEC v5.1)
- Record via `MediaRecorder` using offscreen document pattern
- Codec: `audio/webm;codecs=opus`
- Bitrate: `audioBitsPerSecond: 32000`
- Sample rate: `48000`
- Highpass filter: 80 Hz, Q = 0.7
- Max duration: 90 seconds
- FFT analyser: fftSize = 256 (for waveform visualization)

### Web Implementation

#### 4a. Audio recording hook

**New file: `apps/web/src/hooks/useAudioRecorder.js`**

```js
import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_DURATION_MS = 90_000;
const CODEC = 'audio/webm;codecs=opus';

export default function useAudioRecorder() {
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [analyserData, setAnalyserData] = useState(null);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    analyserRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    chunksRef.current = [];
    setAudioBlob(null);
    setAudioUrl(null);
    setElapsed(0);

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { sampleRate: 48000, channelCount: 1, echoCancellation: true }
    });
    streamRef.current = stream;

    // Highpass filter (80 Hz, Q 0.7)
    const audioCtx = new AudioContext({ sampleRate: 48000 });
    const source = audioCtx.createMediaStreamSource(stream);
    const highpass = audioCtx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 80;
    highpass.Q.value = 0.7;

    // FFT analyser (fftSize 256)
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;

    source.connect(highpass);
    highpass.connect(analyser);

    // Create a destination for MediaRecorder from filtered audio
    const dest = audioCtx.createMediaStreamDestination();
    analyser.connect(dest);

    const recorder = new MediaRecorder(dest.stream, {
      mimeType: CODEC,
      audioBitsPerSecond: 32000,
    });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: CODEC });
      setAudioBlob(blob);
      setAudioUrl(URL.createObjectURL(blob));
      cleanup();
    };

    mediaRecorderRef.current = recorder;
    recorder.start(500); // collect in 500ms chunks
    setRecording(true);

    // Elapsed timer
    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      const ms = Date.now() - startTime;
      setElapsed(ms);
      if (ms >= MAX_DURATION_MS) {
        recorder.stop();
        setRecording(false);
      }
    }, 200);

    // Waveform animation
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    function tick() {
      analyser.getByteFrequencyData(dataArray);
      setAnalyserData(new Uint8Array(dataArray));
      animFrameRef.current = requestAnimationFrame(tick);
    }
    tick();
  }, [cleanup]);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  }, []);

  const discard = useCallback(() => {
    setAudioBlob(null);
    setAudioUrl(null);
    setElapsed(0);
  }, []);

  return { recording, audioBlob, audioUrl, elapsed, analyserData, start, stop, discard };
}
```

#### 4b. Audio recorder UI component

**New file: `apps/web/src/components/AudioRecorder.jsx`**

```jsx
import useAudioRecorder from '../hooks/useAudioRecorder.js';

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function Waveform({ data }) {
  if (!data) return null;
  const bars = 32;
  const step = Math.floor(data.length / bars);
  return (
    <div className="waveform" aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => {
        const value = data[i * step] || 0;
        const height = Math.max(3, (value / 255) * 28);
        return <span key={i} className="waveform-bar" style={{ height: `${height}px` }} />;
      })}
    </div>
  );
}

export default function AudioRecorder({ onRecorded, onDiscard }) {
  const { recording, audioBlob, audioUrl, elapsed, analyserData, start, stop, discard } = useAudioRecorder();

  function handleDiscard() {
    discard();
    onDiscard?.();
  }

  function handleAccept() {
    if (audioBlob) onRecorded?.(audioBlob, audioUrl);
  }

  return (
    <div className="audio-recorder">
      {!recording && !audioUrl && (
        <button className="audio-record-btn" onClick={start} title="Record voice note">
          <span className="audio-record-icon" aria-hidden="true" />
          Voice note
        </button>
      )}

      {recording && (
        <div className="audio-recording">
          <span className="audio-recording-dot" />
          <Waveform data={analyserData} />
          <span className="audio-elapsed">{formatDuration(elapsed)} / 1:30</span>
          <button className="button-text" onClick={stop}>Done</button>
        </div>
      )}

      {!recording && audioUrl && (
        <div className="audio-preview">
          <audio src={audioUrl} controls />
          <div className="audio-preview-actions">
            <button className="button-text" onClick={handleDiscard}>Discard</button>
            <button className="button-text" onClick={handleAccept} style={{ color: 'var(--accent)' }}>Attach</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

#### 4c. Integration point

The `AudioRecorder` component should be added to `apps/web/src/pages/NewAnnotation.jsx` inside the commentary step (step 3 of the wizard). When the user accepts a recording, store the blob and upload it alongside the annotation via `POST /api/annotations/{id}/audio`.

#### 4d. CSS for audio recorder

**File: `apps/web/src/styles/global.css`** — append:

```css
/* ── Audio Recorder ──────────────────────────────────────────── */

.audio-recorder {
  margin: 14px 0;
}

.audio-record-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: 0;
  border-bottom: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-family: var(--font-sans);
  cursor: pointer;
}

.audio-record-btn:hover {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

.audio-record-icon {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--danger);
}

.audio-recording {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}

.audio-recording-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--danger);
  animation: pulse-dot 1.2s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.audio-elapsed {
  color: var(--text-tertiary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.waveform {
  display: flex;
  align-items: end;
  gap: 2px;
  height: 28px;
}

.waveform-bar {
  width: 3px;
  background: var(--accent);
  border-radius: 1px;
  transition: height 120ms ease;
}

.audio-preview {
  display: grid;
  gap: 8px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}

.audio-preview audio {
  width: 100%;
  height: 32px;
}

.audio-preview-actions {
  display: flex;
  gap: 14px;
}
```

#### 4e. Backend audio upload endpoint

**File: `packages/api/src/routes/annotations.js`** — add route:

`POST /api/annotations/:id/audio` — accepts `multipart/form-data` with an audio file. Saves to `data/media/` directory. Stores the path in a new `audio_path` column on the annotations table.

Schema migration needed:
```sql
ALTER TABLE annotations ADD COLUMN audio_path TEXT DEFAULT NULL;
```

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
| 4 | Audio commentary | 60–90 min | 🟡 |
| 5 | X/Twitter OAuth | 45 min | 🟢 |
| 6 | Fly.io deploy | 30–45 min | 🔴 |
| 7 | Demo video + submit | 30 min | 🔴 |

🔴 = required for submission · 🟡 = strong differentiator · 🟢 = nice-to-have

**Total estimated: 3–4 hours of focused work.**
