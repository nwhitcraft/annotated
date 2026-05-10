# Annotated.com — Codex Frontend Brief

## What This Is

Annotated is a social commentary platform for the internet. Users clip moments from articles, YouTube videos, and podcasts, write their take, and publish to a public feed. Think "quote-tweeting the entire internet."

**This is NOT a bookmarking tool. It's a media commentary social network.**

## Your Job

Build the complete React frontend in `apps/web/`. The backend API is already running and fully functional. Your job is to make the frontend look and feel like a professional product — not a hackathon demo.

## Design Direction

### Style: Editorial + Social Hybrid

The visual language should combine the **reading quality of Substack** with the **interaction speed of X/Twitter**.

**Why this mix:**
- Content is commentary on media → needs editorial typography (serif body text, generous line height, proper hierarchy)
- Interactions are social → needs modern UI chrome (tight cards, smooth transitions, quick reactions)
- Audience is power users / media / tech → dark theme is correct

### Reference Products (study these)
1. **Substack Notes** — card-based commentary feed, clean typography
2. **Literal.club** — book annotation social network, excellent dark mode
3. **Readwise Reader** — highlight + note UX, editorial feel
4. **Arc Browser Boost pages** — clean, dark, editorial
5. **X/Twitter quote tweets** — the interaction pattern we're emulating

### Color System
```
--bg-primary:     #09090b     (near-black background)
--bg-card:        #111113     (elevated surfaces)
--bg-elevated:    #18181b     (modals, popovers)
--bg-hover:       #1e1e22     (interactive hover)
--border:         #27272a     (default borders)
--border-subtle:  #1e1e22     (light dividers)

--text-primary:   #fafafa     (headings, primary content)
--text-secondary: #a1a1aa     (descriptions, metadata)
--text-tertiary:  #71717a     (timestamps, muted labels)

--accent:         #6366f1     (indigo — primary brand)
--accent-hover:   #818cf8     (hover state)
--accent-glow:    rgba(99, 102, 241, 0.15)  (focus rings, glows)

--success:        #22c55e
--danger:         #ef4444
--warning:        #f59e0b

Type badges:
  article:  bg rgba(96, 165, 250, 0.1),  text #60a5fa (blue)
  youtube:  bg rgba(248, 113, 113, 0.1), text #f87171 (red)
  podcast:  bg rgba(167, 139, 250, 0.1), text #a78bfa (purple)
```

### Typography
```
UI text:    Inter (sans-serif) — navigation, buttons, labels, metadata
Body text:  Newsreader or Source Serif 4 (serif) — commentary, clip text, comments
Code/mono:  JetBrains Mono or SF Mono — URLs, timestamps

Heading sizes:   32/24/20/16px, weight 600-700, letter-spacing -0.02em to -0.03em
Body:            15-16px, line-height 1.65-1.7
Small/meta:      12-13px
```

### Spacing
```
--space-xs:   4px
--space-sm:   8px
--space-md:   12px
--space-lg:   16px
--space-xl:   24px
--space-2xl:  32px
--space-3xl:  48px

Cards:         padding 20-24px, border-radius 12px
Buttons:       padding 8-12px 16-20px, border-radius 8px
Input fields:  padding 10-12px, border-radius 8px
```

### Key Design Rules
1. **No harsh white text on pure black.** Use zinc-50 (#fafafa) on zinc-950 (#09090b)
2. **Borders should be barely visible.** 1px solid rgba(255,255,255,0.06)
3. **Cards use subtle elevation.** Thin border + very subtle box-shadow, NOT heavy drop shadows
4. **Frosted glass header.** `backdrop-filter: blur(12px)` with semi-transparent background
5. **Smooth transitions everywhere.** 150ms ease for hovers, 200ms for state changes
6. **Content width max 680px** for annotation detail; feed can go 720px
7. **Generous whitespace.** When in doubt, add more space

## Pages to Build

### 1. Feed (`/`)
The home page. A scrolling timeline of annotations from everyone.

**Layout:**
- Hero section: "✦ What the internet is talking about" + subtitle
- Tab bar: Latest | Trending | Articles | Videos | Podcasts | Following
- Annotation cards in a single column (max-width 720px, centered)
- Infinite scroll or "Load more" button

**Each annotation card shows:**
- User avatar + display name + @username + time ago
- Source badge (📰 Article / ▶ Video / 🎙 Podcast) + source domain
- Source title (clickable, links to original)
- The clip: highlighted text for articles, time range for video/audio
- Commentary text (serif font, generous line height)
- Action bar: ♡ Like (count) | 💬 Comment (count) | 📌 Pin | 🔗 Share

**Interaction:**
- Clicking a card opens the detail page (`/a/:id`)
- Like/pin toggles are instant (optimistic update)
- "Following" tab shows only annotations from followed users

### 2. Annotation Detail (`/a/:id`)
The full annotation with comments thread.

**Layout:**
- Back link to feed
- Full annotation card (same as feed but expanded)
- If video/audio: embedded player or clip playback UI
- If article: the highlighted passage in a styled blockquote
- Divider
- Comment thread (threaded/nested)
- Comment input box at bottom

**Comment thread UX — THIS IS CRITICAL:**
- Comments feel like social media replies, not blog comments
- Each comment: avatar + name + time + text
- Reply button on each comment → indented reply with connecting line
- Max nesting: 3 levels deep, then flatten
- Replies are collapsible ("Show N more replies")
- Comment input: clean textarea, serif font, "Reply" button
- Posting is instant (optimistic), shows immediately

**Also include:**
- "File a claim" button (small, secondary, at bottom) — opens inline form
- Share button → copies link

### 3. Profile (`/u/:username`)
User's profile and their annotation history.

**Layout:**
- Profile header: avatar (large) + display name + @username + bio
- Stats row: N annotations | N followers | N following
- Follow/Unfollow button (if not own profile)
- Tab bar: Annotations | Liked
- List of their annotation cards

### 4. New Annotation (`/new`)
Create a new annotation. This is the core product flow.

**Flow:**
1. Paste URL → hit "Detect" → API auto-detects source type
2. Based on type:
   - **Article:** Show extracted title. User pastes/types the key passage to highlight
   - **YouTube:** Show title + thumbnail. User sets start/end time (max 90 seconds)
   - **Podcast:** Show title. User sets start/end time (max 90 seconds)
3. User writes their commentary (serif textarea, feels like writing a post)
4. Hit "Post" → redirects to the annotation detail page

**Design notes:**
- Stepped flow (URL → Clip → Commentary → Post) with visual progress
- Each step in a card
- The commentary textarea should feel premium — proper font, good size, not cramped

### 5. Login/Auth (`/login`)
Simple, clean auth page.

**Layout:**
- Centered card with logo
- "Sign in with Google" button (Google-branded)
- "Sign in with X" button (X-branded)
- Subtitle: "Join the conversation"
- Footer: "By signing in you agree to Terms & Privacy"

**Note:** OAuth endpoints are not yet live. Build the UI and have the buttons call `GET /api/auth/google` and `GET /api/auth/twitter` — the backend will handle the redirect flow once wired.

## Components to Build

### AnnotationCard
The most important component. Used on feed, profile, and detail pages.

Props: `annotation` object, `compact` boolean (for feed vs detail), `onLike`, `onPin`

### CommentThread
Recursive threaded comments.

Props: `comments` array (already nested from API), `onReply`, `onPost`

### CommentInput
Textarea + post button. Used at top level and as inline reply.

### UserAvatar
Circular avatar with fallback to first-letter initial.

### SourceBadge
Colored pill showing source type (article/youtube/podcast).

### ActionBar
Like + Comment + Pin + Share buttons with counts.

### Layout/Nav
Sticky top nav with frosted glass effect. Logo left, nav links center, user avatar right.

## API Reference

Base URL: `/api` (proxied by Vite — already configured in `vite.config.js`)

### Feed
- `GET /api/feed` — latest annotations (query: `?type=article|youtube|podcast`, `?limit=`, `?offset=`)
- `GET /api/feed/trending` — trending (most liked/pinned in 7 days)
- `GET /api/feed/following/:userId` — following feed

### Annotations
- `GET /api/annotations/:id` — single annotation with nested comments + recent_likes
- `POST /api/annotations` — create (body: user_id, source_url, source_type, source_title, source_domain, clip_text, clip_start_sec, clip_end_sec, commentary)
- `PATCH /api/annotations/:id` — update (commentary, is_public)
- `DELETE /api/annotations/:id`
- `POST /api/annotations/:id/like` — toggle like (body: user_id) → { liked: bool }
- `POST /api/annotations/:id/pin` — toggle pin (body: user_id) → { pinned: bool }
- `POST /api/annotations/:id/comments` — add comment (body: user_id, body, parent_id?) → { id }
- `GET /api/annotations/:id/comments` — threaded comment tree → { comments: [...], total }

### Users
- `GET /api/users/:username` — profile + stats
- `GET /api/users/:username/annotations` — user's annotations
- `POST /api/users/:id/follow` — toggle follow (body: user_id) → { following: bool }

### Clip Detection
- `POST /api/clip/detect` — detect source type from URL (body: url) → { type, title, domain }
- `POST /api/clip/article` — extract article metadata (body: url) → { title, excerpt, content, author, domain }

### Health
- `GET /api/health` → { status: "ok", version: "0.1.0" }

## Annotation Object Shape
```json
{
  "id": "I6KyT-Ah5Wna",
  "user_id": "hZTIgPwtkZPF",
  "source_url": "https://...",
  "source_title": "AI Agents Are Reshaping...",
  "source_type": "article",
  "source_domain": "nytimes.com",
  "source_thumbnail": null,
  "clip_text": "The shift from chatbots...",
  "clip_start_sec": null,
  "clip_end_sec": null,
  "clip_media_path": null,
  "commentary": "This is the key insight...",
  "is_public": 1,
  "pin_count": 0,
  "comment_count": 3,
  "like_count": 2,
  "created_at": "2026-05-10 07:08:15",
  "updated_at": "2026-05-10 07:08:15",
  "username": "jason",
  "display_name": "Jason Calacanis",
  "avatar_url": null,
  "comments": [...],
  "recent_likes": [...]
}
```

## Tech Stack
- React 18+ with react-router-dom v7
- Vite as build tool (already configured)
- No CSS framework — write clean CSS (CSS custom properties already set up in `src/styles/global.css`)
- Google Fonts: Inter (400,500,600,700) + Newsreader (400,400i,600)

## What Already Exists
- `apps/web/package.json` — dependencies declared
- `apps/web/vite.config.js` — proxy to API on :3080
- `apps/web/src/styles/global.css` — design tokens and base styles
- `apps/web/src/main.jsx` — React entry point
- `apps/web/src/App.jsx` — Router with route stubs
- `apps/web/src/components/Layout.jsx` — Shell with nav
- `apps/web/src/components/AnnotationCard.jsx` — Basic card (needs redesign)
- `apps/web/src/pages/Feed.jsx` — Basic feed (needs redesign)
- `apps/web/src/pages/AnnotationPage.jsx` — Basic detail (needs redesign)
- `apps/web/src/pages/Profile.jsx` — Basic profile (needs redesign)
- `apps/web/src/pages/NewAnnotation.jsx` — Basic create form (needs redesign)

**You can rewrite any of these files completely.** The existing code is scaffolding, not sacred. Make it look great.

## Quality Bar
- This needs to look like it was built by a funded startup, not a weekend project
- Smooth animations and transitions
- Proper loading states (skeleton screens, not spinners)
- Error handling (empty states, 404s, network errors)
- Mobile responsive (works on phone, great on tablet, excellent on desktop)
- Accessible (proper focus states, ARIA labels, keyboard navigation)

## Don't Do
- Don't touch anything outside `apps/web/`
- Don't modify the API
- Don't add a CSS framework (Tailwind, etc.) — write clean CSS
- Don't add state management libraries (Redux, Zustand) — React state + context is enough
- Don't implement actual OAuth logic — just build the UI that calls the auth endpoints
