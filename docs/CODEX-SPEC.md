# Annotated — Codex Completion Spec

**Version:** 5.2
**Date:** 2026-05-12
**Author:** Stark (written for Codex)
**Bounty:** Jason Calacanis $5,000 via Launch.co (deadline ~May 15, 2026)
**Repo:** `github.com/nicholaswhitcraft/annotated`
**Working branch:** `frontend-v2`

---

## 1. What This Is

A complete, actionable spec for Codex to finish the Annotated.com project. Everything Codex needs: current codebase state, what's built, what's missing, what to build, exact file paths, and design decisions.

**Goal:** Ship a complete product — web + Chrome extension + desktop app (Tauri). The desktop app is not a future tier, it is a shipping requirement.

---

## 2. Current Codebase State (as of 2026-05-12)

### What's Built ✅

| Component | Status | Details |
|-----------|--------|---------|
| **API Backend** | ✅ Complete | Hono + SQLite (better-sqlite3), port 3080 |
| **DB Schema** | ✅ Complete | users, annotations, comments (threaded), follows, pins, likes, claims |
| **Annotations CRUD** | ✅ Complete | Create, read, update, delete, with user resolution by id or username |
| **Feed** | ✅ Complete | Public feed, following feed (by userId), trending (pin_count + comment_count, last 7d) |
| **Users** | ✅ Complete | Profile lookup, create/upsert via OAuth, follow/unfollow, user annotations |
| **Likes/Pins** | ✅ Complete | Toggle like/unlike, toggle pin/unpin, counts maintained |
| **Comments** | ✅ Complete | Threaded (parent_id), nested replies |
| **Claims** | ✅ Complete | DMCA fair-use claim filing + admin listing |
| **Clip Engine** | ✅ Complete | Article (Readability), YouTube (yt-dlp 240p/90s), Podcast (yt-dlp+ffmpeg fallback) |
| **Web Frontend** | ✅ Complete | React + React Router, editorial newspaper design (frontend-v2) |
| **Web Routes** | ✅ Complete | `/`, `/login`, `/a/:id`, `/u/:username`, `/new` |
| **Login Page** | ✅ Complete | Google + X OAuth buttons, JWT from query params |
| **API Client** | ✅ Complete | Full client with auth token in localStorage, demo-user fallback |
| **Chrome Extension** | ✅ Complete | MV3, side panel, blur overlay, inline tooltip, hotkey, video timeline |
| **Extension CSS** | ✅ Complete | Editorial style, matches frontend-v2 exactly |
| **Extension Side Panel** | ✅ Complete | Compose, related annotations, following feed, URL paste, auth bridge |
| **Demo Data** | ✅ Seeded | 3 users, 3 annotations, threaded comments, likes |
| **E2E Tests** | ✅ Passing | API tests |

### What's Missing ❌ (Critical)

| Gap | Priority | Impact |
|-----|----------|--------|
| **No auth system** | 🔴 Critical | API has zero JWT validation; extension hardcodes `demo-user` |
| **No auth bridge** | 🔴 Critical | No `/extension-auth` page, no postMessage JWT handoff |
| **No onboarding** | 🔴 Critical | Route doesn't exist, no wizard, no tutorial |
| **No annotation type tags** | 🟡 High | Schema missing `annotation_type` field |
| **No X/Twitter support** | 🟡 High | Not in detection, not in clip engine, not in extension |
| **No voting/credibility** | 🟡 High | No Noteworthy signal, no credibility score |
| **No claims in extension** | 🟡 Medium | Can't file claims from sidebar |
| **No claims in AnnotationItem** | 🟡 Medium | Claim count/status not shown on cards |
| **No admin claims dashboard** | 🟡 Medium | Claims endpoint exists but no UI to review |
| **No iTunes podcast fallback** | 🟡 Medium | Only URL regex detection |
| **Following is local-only** | 🟡 Medium | Extension uses chrome.storage, not API follows table |
| **Content detection is basic** | 🟡 Medium | No JSON-LD, no shadow DOM, no smart reclassification |
| **API_BASE hardcoded** | 🟡 Medium | `localhost:3080` in extension, relative `/api` in web |
| **Duplicate compose paths** | 🟠 Medium | Inline tooltip AND side panel both post annotations — REMOVE inline tooltip, side panel is the only surface |
| **Extension bugs** | 🟠 Medium | Quote closing, keyboard shortcut, highlight persistence, etc. |

---

## 3. ByteTalk Reverse Engineering (Key Intelligence)

### ByteTalk Extension Architecture

ByteTalk's extension (`annotated.bytetalk.ai/extension/annotated-extension.zip`) was fully extracted and analyzed. Key findings:

**Manifest:**
- Name: `"Annotated"`, version: `"0.1.0"`
- Permissions: `activeTab`, `sidePanel`, `storage`, `offscreen`, `tabs`
- Host: `<all_urls>`
- Uses offscreen document for audio recording

**Message Types (content ↔ background ↔ sidepanel):**
```
AUTH_TOKEN, PAGE_INFO, TEXT_SELECTED, OPEN_SIDE_PANEL,
CREATE_ANNOTATION, UPLOAD_AUDIO, CLIP_SOURCE,
LOOKUP_PODCAST_ALTERNATIVE, RESCAN, START_RECORDING,
STOP_RECORDING, GET_AUDIO_LEVELS, RECORDING_AUTO_STOPPED,
ANNOTATED_EXTENSION_READY, ANNOTATED_EXTENSION_PING,
ANNOTATED_AUTH_TOKEN
```

**Content Detection Intelligence:**
- JSON-LD parsing for article metadata
- Shadow DOM traversal for SPA detection
- Smart reclassification (e.g., detecting YouTube shorts vs regular videos)
- Podcast domain detection: `podcasts.apple.com`, `open.spotify.com`, `soundcloud.com`, `overcast.fm`, `pca.st`, `pocketcasts.com`, `castro.fm`, `anchor.fm`
- iTunes API fallback: `https://itunes.apple.com/search?term=${e}&entity=podcastEpisode&limit=10`
- YouTube URL detection: `/youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts/i.test`

**Video Clipping:**
- Uses `captureStream()` on `<video>` elements (NOT yt-dlp)
- Canvas: 426×240, WebM/VP9+Opus, 350kbps video, 64kbps audio
- Works on any `<video>` element regardless of source

**Audio Recording:**
- Offscreen document for MediaRecorder
- Codec: `audio/webm;codecs=opus`
- `audioBitsPerSecond: 32000`, `sampleRate: 48000`
- Highpass filter: 80Hz, Q=0.7
- Max duration: 90000ms (90s)
- Analyser: `fftSize=256` for audio levels

**API Endpoints:**
```
POST /api/annotations
POST /api/annotations/{id}/source-clip
POST /api/annotations/{id}/clip-upload
POST /api/annotations/{id}/audio
GET /api/auth/signin
```

**Auth Bridge:**
- Domains: `https://annotated.bytetalk.ai/*`, `http://localhost:3000/*`
- Uses `postMessage` for JWT handoff from web to extension

**Annotation Type Tags (ByteTalk):**
`Hot take`, `Steel-man`, `Fact check`, `Receipt`, `Explainer`

**Annotation Limit:** 500 chars (our limit: 280)

---

## 4. Design Decisions

### Annotation Type Tags
**Decision:** Editorial framing, NOT comedic.
- `Opinion` · `Analysis` · `Fact Check` · `Context` · `Correction` · `Breaking`
- Stored as `annotation_type` field in annotations table

### AI Summaries
**Decision:** Build it. Use local models (Qwen 3.6 35B) for summarization when available, fall back to hosted models.

### Voice Note Annotations
**Decision:** Build it. Architecture documented from ByteTalk analysis (offscreen doc + MediaRecorder). Core feature for desktop tier.

### X/Twitter Clip Support
**Decision:** YES, via Twitter oEmbed API (public, no auth required).
- Endpoint: `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}`
- Returns tweet text, author, embed HTML

### Voting System
**Decision:** Journalistic style.
- `Noteworthy` — single positive signal (NOT upvote/downvote)
- `Credibility` — earned through engagement, accurate fact checks, helpful annotations
- Displayed on profile card

### YouTube Clipping
**Decision:** Real yt-dlp extraction (full media files) everywhere. Desktop app gets full media pipeline. Web tier uses iframe embeds with `?start=X&end=Y` for playback.

### Podcasts
**Decision:** ffmpeg extraction (audio only). Desktop app gets full media pipeline.

### Articles
**Decision:** Readability extraction.

### X/Twitter
**Decision:** oEmbed API (public, no auth required).

### Desktop App (Tauri)
**Decision:** BUILD IT. This is the flagship product.
- Tauri v2, Rust backend
- Custom URL scheme: `annotated://callback` for auth
- Full media pipeline: yt-dlp, ffmpeg, Whisper ASR
- Screen clipping (clip anything on screen)
- Private annotations
- Collections
- Full-text search
- Paid tier (separate from free web tier)
- Auth via `annotated://callback` redirect to Tauri app

### Onboarding Flow (5 steps)
1. Username pick
2. Interests selection
3. Follow 3+ starter accounts
4. Extension install CTA
5. Guided first-clip tutorial

### Extension Auth Handoff
- Extension opens `annotated.com/extension-auth` popup
- Returns JWT via `postMessage`
- Stored in `chrome.storage.session.auth_token` (not persistent)

### Desktop Auth
- Custom URL scheme: `annotated://callback`
- Tauri handles the redirect

### Tier Model
| Feature | Free | Pro (Desktop) |
|---------|------|---------------|
| Chrome extension | ✅ | ✅ |
| Web annotations | ✅ | ✅ |
| Desktop app | ❌ | ✅ |
| Private annotations | ❌ | ✅ |
| Collections | ❌ | ✅ |
| Full-text search | ❌ | ✅ |
| Clip anything on screen | ❌ | ✅ |
| AI summaries | ❌ | ✅ |
| Voice notes | ❌ | ✅ |
| Public annotations | ✅ | ✅ |

### CSS Style
- No border-radius (square editorial style)
- No box-shadow
- Newsreader serif for quotes/commentary
- Inter sans-serif for UI elements

### Clip Limits
- YouTube clips: ≤90s, downscaled to 240p
- Podcast audio: ≤90s
- Annotation text: 280 chars

### Claims System
**Decision:** Open filing (anyone can file, no login required). DMCA-style fair-use claims.
- Claims are filed against specific annotations via the annotation detail page
- Claims have status: `pending` → `reviewed` → `resolved`
- Admin can list claims by status
- Claims ARE shown on annotation cards (⚠ N badge)
- Claims ARE available from the extension side panel

### Sidebar UX (🔴 Final Decision)
**Decision:** The Chrome extension side panel IS the annotation surface. It is final.
- The side panel handles all annotation composition, clipping, and browsing
- The inline tooltip (content.js) is a duplicate compose path — REMOVE it
- The side panel is the single source of truth for annotation UX in the extension
- The desktop app MUST use the same sidebar UX pattern (not a different flow)
- The only changes to the side panel are:
  1. Login function (auth bridge via postMessage)
  2. Profile picture circle (replaces login button, links to user's full feed)
- Codex should NOT redesign, restructure, or replace the side panel
- Codex should NOT add alternative annotation surfaces (no new tooltips, popups, or floating widgets)
- The side panel's clipping technique (iframe embed + captureStream) is the correct approach

---

## 5. What Codex Must Build

### 5.1 Auth System (🔴 Critical)

**Files to create/modify:**
- `packages/api/src/middleware/auth.js` — JWT verification middleware
- `packages/api/src/routes/auth.js` — OAuth callback handlers (Google + X)
- `apps/web/src/pages/ExtensionAuth.jsx` — `/extension-auth` page for JWT handoff
- `apps/web/src/pages/Onboarding.jsx` — 5-step onboarding wizard
- `apps/web/src/pages/OnboardingTutorial.jsx` — guided first-clip walkthrough
- `apps/extension/src/auth-bridge.js` — postMessage JWT handoff
- `apps/extension/src/content.js` — read auth from session storage

**API changes:**
- Add `GET /api/auth/me` — returns current user or 401
- Add `GET /api/auth/google` — Google OAuth redirect
- Add `GET /api/auth/google/callback` — Google OAuth callback
- Add `GET /api/auth/twitter` — X OAuth redirect
- Add `GET /api/auth/twitter/callback` — X OAuth callback
- Add `GET /api/users/suggested` — starter accounts for onboarding

**Extension changes:**
- On install, open `extension-auth` popup
- Wait for `postMessage` with JWT
- Store in `chrome.storage.session.auth_token`
- Content script reads token from session storage
- Side panel reads token from session storage
- All API calls include `Authorization: Bearer <token>`

### 5.2 Annotation Type Tags (🟡 High)

**DB migration:**
```sql
ALTER TABLE annotations ADD COLUMN annotation_type TEXT DEFAULT 'Opinion';
CREATE INDEX IF NOT EXISTS idx_annotations_type ON annotations(annotation_type);
```

**Valid types:** `Opinion`, `Analysis`, `Fact Check`, `Context`, `Correction`, `Breaking`

**Files to modify:**
- `packages/api/src/db.js` — add column to schema + migration
- `packages/api/src/routes/annotations.js` — accept `annotation_type` in POST
- `apps/extension/src/content.js` — type selector in tooltip
- `apps/extension/src/sidepanel.js` — type selector in compose
- `apps/web/src/pages/NewAnnotation.jsx` — type selector
- `apps/web/src/pages/Feed.jsx` — filter by type

### 5.3 X/Twitter Support (🟡 High)

**Files to create:**
- `packages/clip-engine/src/twitter.js` — oEmbed extraction

**API changes:**
- `POST /api/clip/twitter` — extract tweet via oEmbed
- `POST /api/clip/detect` — add `twitter` to type detection

**Extension changes:**
- Add `twitter.com` and `x.com` to content detection in `content.js`
- Add oEmbed extraction in side panel

**Detection pattern:**
```js
/twitter\.com|x\.com/i.test(url)
```

### 5.4 Voting / Credibility (🟡 High)

**DB migration:**
```sql
ALTER TABLE annotations ADD COLUMN noteworthy_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN credibility_score INTEGER DEFAULT 0;
```

**API changes:**
- `POST /annotations/:id/noteworthy` — toggle noteworthy (like but different semantics)
- Credibility score calculated from: noteworthy received, fact checks accepted, annotations created

**Files to modify:**
- `packages/api/src/routes/annotations.js` — add noteworthy endpoint
- `packages/api/src/routes/users.js` — add credibility calculation
- `apps/web/src/pages/Feed.jsx` — display noteworthy count
- `apps/web/src/pages/Profile.jsx` — display credibility score

### 5.5 Claims — Extension + Card Integration (🟡 Medium)

**Current state:** Claims exist only on the annotation detail page (`/a/:id`). The `AnnotationItem` card component and the extension side panel have no claims functionality.

**What to build:**

#### 5.5.1 Claims count on AnnotationItem cards

**File:** `apps/web/src/components/AnnotationItem.jsx`

Add a claim count indicator next to the existing like/comment/share buttons in the ActionRow. The `AnnotationItem` component receives an `annotation` prop that includes all annotation fields. The claims count should be fetched from the API and displayed as a small "⚠ N" badge.

**API endpoint needed:**
```
GET /api/annotations/:id/claims
```
Returns: `{ count: N, claims: [...] }`

**UI:** Add a claim button to `ActionRow.jsx` (the existing action buttons component):
- Shows "⚠ N" where N is the claim count
- Clicking opens a small inline claim form (same as the detail page)
- If the user is logged in, pre-fill their email

**CSS:** Add to `global.css`:
```css
.claim-count {
  font-size: 11px;
  color: var(--text-tertiary);
  cursor: pointer;
}
.claim-count:hover {
  color: var(--danger);
}
```

#### 5.5.2 Claims in the extension side panel

**File:** `apps/extension/src/sidepanel.js`

In the `renderRelatedItem()` function, add a claim indicator next to the existing like/comment counts:
```
${a.claim_count ? ` · ⚠ ${a.claim_count}` : ''}
```

Also add a "File a claim" button to the compose area when the user is logged in. When clicked, it opens a small form (email + reason) that posts to `POST /api/claims`.

**API changes needed:**
- Add `claim_count` to the annotations returned by the feed endpoints
- The `GET /api/annotations/:id` endpoint should include `claim_count`

**DB change:** Add `claim_count` column to annotations table:
```sql
ALTER TABLE annotations ADD COLUMN claim_count INTEGER DEFAULT 0;
```

#### 5.5.3 Admin claims dashboard

**File:** `apps/web/src/pages/AdminClaims.jsx` (new)

Route: `/admin/claims`

A simple table showing all claims with:
- Claim ID
- Annotation link (clickable)
- Claimant email
- Reason (truncated, expandable)
- Status (pending/reviewed/resolved)
- Created date
- Action buttons: "Mark reviewed", "Mark resolved", "Delete"

**API changes:**
- `PATCH /api/claims/:id` — update claim status
- `DELETE /api/claims/:id` — delete a claim
- `GET /api/claims` — already exists, list claims by status

**Auth:** Behind auth. For MVP, any logged-in user can access it. Later: role-based access.

### 5.8 Desktop App — Tauri (🔴 Critical)

**This is the flagship product. Build it.**

**Files to create:**
- `apps/desktop/` — Tauri v2 project
- `apps/desktop/src-tauri/` — Rust backend
- `apps/desktop/src/` — Tauri frontend (can reuse web components)

**Architecture:**
- Tauri v2 with Rust backend
- Frontend: React (reuse web components from `apps/web/src/`)
- Backend: Rust for media processing (yt-dlp, ffmpeg, Whisper)
- Auth: Custom URL scheme `annotated://callback` for OAuth
- Storage: Local SQLite for offline annotations
- Screen clipping: Full screen capture (not just browser tabs)

**Features:**
- Full media pipeline: yt-dlp for YouTube, ffmpeg for podcasts
- Whisper ASR for automatic transcription
- Screen clipping (clip anything on screen, not just browser)
- Private annotations (stored locally, sync when online)
- Collections (organize annotations into groups)
- Full-text search (local + cloud)
- AI summaries (local Qwen 3.6 35B when available)
- Voice note annotations (MediaRecorder → WebM/Opus)
- OAuth via `annotated://callback` redirect
- Sync with web app (cloud annotations)

**Rust backend tasks:**
- `yt-dlp` wrapper for YouTube video extraction
- `ffmpeg` wrapper for podcast audio extraction
- `whisper` wrapper for ASR transcription
- Screen capture API (macOS + Windows)
- Local SQLite database (via `rusqlite`)
- Sync engine (conflict resolution with web app)
- `annotated://` URL scheme handler

**Tauri config:**
- Bundle: `.dmg` (macOS), `.msi` (Windows)
- Code signing: optional for MVP
- Auto-updater: `tauri-updater` for OTA updates
- Permissions: `media-recorder`, `screen-capture`, `fs` (full access)

**Build order for desktop:**
1. Tauri project scaffold
2. Reuse web frontend (React components)
3. Rust backend: yt-dlp wrapper
4. Rust backend: ffmpeg wrapper
5. Rust backend: Whisper ASR
6. Rust backend: screen capture
7. Rust backend: local SQLite
8. Auth: `annotated://callback` handler
9. Sync engine
10. Collections + full-text search
11. AI summaries (local model integration)
12. Voice notes (MediaRecorder + upload)
13. Private annotations
14. Polish + bundle

### 5.6 iTunes Podcast Fallback (🟡 Medium)

**API changes:**
- `POST /api/clip/podcast/lookup` — search iTunes API for podcast episode

**Files to create:**
- `packages/api/src/routes/podcast-lookup.js` — iTunes API wrapper

**Detection enhancement in `content.js`:**
Add full ByteTalk podcast domain list:
```js
const PODCAST_DOMAINS = [
  'podcasts.apple.com', 'open.spotify.com', 'soundcloud.com',
  'overcast.fm', 'pca.st', 'pocketcasts.com', 'castro.fm', 'anchor.fm'
];
```

### 5.7 Following Sync (🟡 Medium)

**Extension changes:**
- Replace `chrome.storage.local` following list with API-synced follows
- On auth, fetch `GET /api/users/me` to get user ID
- Fetch `GET /api/feed/following/:userId` for following feed

⚠️ [... middle content omitted — showing head and tail ...]

apps/web/src/pages/ExtensionAuth.jsx        ← CREATE
apps/web/src/pages/AdminClaims.jsx          ← CREATE (new in v4)
apps/web/src/pages/DownloadPage.jsx         ← CREATE
apps/web/src/components/ActionRow.jsx       ← MODIFY (add claim button)
apps/web/src/components/AnnotationItem.jsx  ← MODIFY (add claim count)
apps/web/src/lib/api.js                     ← MODIFY (add claim APIs)
apps/web/src/styles/global.css              ← MODIFY (add claim styles)
apps/extension/src/sidepanel.js             ← MODIFY (add claim indicator)
apps/extension/src/content.js               ← MODIFY (add claim detection)
```

---

## 7. Build Order (Recommended)

Codex should build in this order. Desktop app work runs **in parallel** with web/extension — it's a shipping requirement, not a later phase.

### Phase 1: Foundation (do first, everything depends on it)
1. **Auth system** — JWT middleware, OAuth routes, `/extension-auth` page, auth bridge in extension, `annotated://callback` handler in desktop
2. **Fix extension bugs** — quote closing, keyboard shortcut, highlight after dismiss, REMOVE inline tooltip (side panel is the only annotation surface), speech bubble positioning
3. **Desktop scaffold** — Tauri v2 project, reuse web React components, set up Rust backend structure

### Phase 2: Core Features (parallel: web + desktop)
4. **Annotation type tags** — DB migration, API acceptance, UI selectors in extension + web + desktop
5. **X/Twitter support** — oEmbed extraction, content detection, side panel display
6. **Voting / credibility** — noteworthy endpoint, credibility score, UI display
7. **Claims — extension + card + admin** — `claim_count` column, claim endpoints, claim badge on cards, claim button in ActionRow, claim indicator in extension, `/admin/claims` dashboard
8. **Desktop media pipeline** — yt-dlp wrapper, ffmpeg wrapper, Whisper ASR, screen capture

### Phase 3: Activation & Polish
9. **Onboarding flow** — 5-step wizard, tutorial page, starter accounts
10. **Content detection intelligence** — JSON-LD, shadow DOM, smart reclassification
11. **Following sync** — API-synced follows, remove local storage dependency
12. **iTunes podcast fallback** — iTunes API wrapper, domain list expansion
13. **API_BASE configuration** — configurable base URL, environment handling

### Phase 4: Desktop Completeness
14. **Desktop sync engine** — conflict resolution with web app
15. **Desktop collections + full-text search**
16. **Desktop AI summaries** — local model integration
17. **Desktop voice notes** — MediaRecorder + upload
18. **Desktop private annotations** — local storage, sync when online
19. **Desktop polish + bundle** — `.dmg` / `.msi`

---

## 8. Rules & Context

### PomPom Workstream
- **PARKED** — safe commit: `5073ad1` on `origin/codex/openclaw-pompom-copy`
- Do NOT touch without explicit confirmation

### Model Infrastructure
- Local models: Qwen 3.6 35B A3B 8-bit via MLX on `127.0.0.1:8081`
- Mac Studio with 256GB RAM available
- Use local models for AI summaries when available, fall back to hosted

### Extension Publishing
- Chrome Web Store ($5 dev fee) — to be done after MVP

### Deployment
- API: port 3080
- Web: port 3090
- Current servers: `http://100.75.212.104:3080` and `:3090`

### OAuth Credentials
- Nick needs to provide Google + X OAuth credentials
- Until then, stub endpoints that return 501

### Search
- DuckDuckGo is useless for Codex — use Perplexity via OpenRouter for web lookups
- For code analysis, read the actual files

---

## 9. Testing Checklist

- [ ] Auth flow works (login → JWT → extension auth)
- [ ] Extension can post annotation with auth
- [ ] Feed shows annotations from followed users
- [ ] Annotation type tags display correctly
- [ ] X/Twitter clip works via oEmbed
- [ ] Noteworthy toggle works
- [ ] Credibility score displays on profile
- [ ] Claims count shows on annotation cards
- [ ] Claims can be filed from annotation cards (inline)
- [ ] Claims can be filed from extension side panel
- [ ] Admin claims dashboard works (list, review, resolve, delete)
- [ ] Onboarding flow completes
- [ ] Following feed loads from API
- [ ] All extension bugs fixed
- [ ] API_BASE configurable
- [ ] E2E tests pass
- [ ] Desktop app builds (Tauri)
- [ ] Desktop app can clip YouTube via yt-dlp
- [ ] Desktop app can extract podcast audio via ffmpeg
- [ ] Desktop app can transcribe via Whisper
- [ ] Desktop app can screen-clip
- [ ] Desktop app handles `annotated://callback` auth
- [ ] Desktop app syncs with web app
- [ ] Desktop app has collections + full-text search
- [ ] Desktop app has AI summaries (local model)
- [ ] Desktop app has voice notes

---

## 10. What NOT to Build

- ❌ PomPom workstream (parked)
- ❌ Real-time features (not needed for v1)
- ❌ Complex recommendation algorithms (not needed for v1)

---

## 11. Success Criteria for MVP

**Web + Extension:**
1. User can sign up with Google or X
2. User can install extension and annotate any page
3. Annotations appear in public feed
4. User can follow others and see their annotations
5. User can add annotation type tags
6. User can clip YouTube videos (≤90s)
7. User can clip articles (text extraction)
8. User can file claims against annotations (web + extension)
9. Admin can review and resolve claims
10. Extension UX is polished (no bugs from audit)
11. Onboarding guides first-time users

**Desktop App:**
12. Desktop app builds and runs (Tauri)
13. Desktop app can clip YouTube via yt-dlp (full media)
14. Desktop app can extract podcast audio via ffmpeg
15. Desktop app can transcribe via Whisper ASR
16. Desktop app can screen-clip (anything on screen)
17. Desktop app handles `annotated://callback` OAuth
18. Desktop app syncs with web app
19. Desktop app has collections + full-text search
20. Desktop app has AI summaries (local model)
21. Desktop app has voice notes

If all 21 work, we ship.
