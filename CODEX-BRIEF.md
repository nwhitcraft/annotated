# Annotated.com — Codex Frontend Brief (v2)

## ⚠️ DESIGN RESET — READ THIS FIRST

**The dark theme is scrapped.** See `design-reference.jpg` in the repo root — that is the new visual target. Match it.

The new direction is **newspaper editorial**. Clean, light, typography-driven. Think The Economist's opinion section online, not a tech dashboard.

---

## What This Is

Annotated is a social commentary platform for the internet. Users clip moments from articles, YouTube videos, and podcasts, write their take, and publish to a public feed. Think "quote-tweeting the entire internet."

**This is NOT a bookmarking tool. It's a media commentary social network.**

## Your Job

Rebuild the React frontend in `apps/web/` to match the newspaper-editorial design in `design-reference.jpg`. The backend API is running. The existing dark-theme code should be **replaced entirely** — don't try to patch it.

---

## Design Direction: Newspaper Editorial

### The Core Idea

This is a reading product. People come here to read sharp commentary on the internet. The design should feel like opening a beautifully typeset opinion section — not scrolling a social media feed.

### Reference: `design-reference.jpg`

Study it. The key decisions visible in the mockup:

1. **White/light background** — clean, airy, paper-like
2. **No cards** — annotations separated by thin horizontal ruled lines
3. **Serif branding** — "annotated" in an elegant serif
4. **Bold commentary as headline** — the user's take is the loudest element
5. **De-emphasized metadata** — author, @handle, domain, timestamp are small and muted
6. **Blockquote treatment** — clipped text is clearly quoted, secondary to the take
7. **Tiny muted action icons** — heart, comment, share in gray, not colorful
8. **Massive whitespace** — the content breathes
9. **Minimal header** — logo left, simple text nav center, small avatar right. No pills, no glass, no glow

### Reference Products (study these)
1. **The Information** — clean editorial web layout
2. **Stratechery** — single-column essay format, typography-first
3. **Financial Times web** — warm neutral palette, serif headlines, ruled lines
4. **Matter (old Medium long-form)** — reading-focused, generous whitespace
5. **Substack** — the newsletter reading experience (not the social feed)

### Color System
```
--bg-primary:     #ffffff     (or very slightly warm: #FAFAF8)
--bg-surface:     #f7f7f5     (subtle section backgrounds if needed)
--bg-hover:       #f0f0ee     (interactive hover)
--border:         #e5e5e3     (default borders, ruled lines)
--border-subtle:  #eeeeec     (lighter dividers)

--text-primary:   #1a1a1a     (headings, commentary — near black)
--text-secondary: #6b6b6b     (descriptions, metadata)
--text-tertiary:  #999999     (timestamps, muted labels)

--accent:         #6366f1     (indigo — used SPARINGLY: links, active nav only)
--accent-hover:   #4f46e5     (hover state)

--danger:         #dc2626     (errors only)

Source type colors (muted, editorial):
  article:  #2563eb  (blue, text only — no colored background pills)
  youtube:  #dc2626  (red, text only)
  podcast:  #7c3aed  (purple, text only)
```

### Typography — THIS IS EVERYTHING

The typography makes or breaks this design. Get it right.

```
Branding:     A proper serif — Newsreader, Playfair Display, or Lora
              Used for: the "annotated" wordmark

Commentary:   Newsreader or Source Serif 4 (serif)
              Size: 18-20px, weight 600-700, line-height 1.5
              THIS IS THE HEADLINE OF EVERY ANNOTATION — bold, prominent

Clip/Quote:   Same serif, 16px, italic, line-height 1.7
              Indented or with a subtle left rule

UI chrome:    Inter (sans-serif) — navigation, buttons, labels, metadata
              Size: 13-14px, weight 400-600

Metadata:     Inter, 12-13px, weight 400, color: --text-tertiary
              Author name can be 500 weight

Mono:         JetBrains Mono or SF Mono — source domains, timestamps
              Size: 11-12px
```

**Load from Google Fonts in index.html:**
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Newsreader:ital,wght@0,400;0,600;0,700;1,400&display=swap" rel="stylesheet">
```

### Layout & Spacing

```
Content column:     max-width 680px, centered
                    Generous margin: min 24px on mobile, auto on desktop

Between annotations: 1px solid var(--border) horizontal line
                     padding: 28-32px top and bottom per annotation
                     NO cards, NO shadows, NO border-radius on items

Header height:      56-60px, simple bottom border, NOT sticky (or sticky with very subtle border only)
                    No frosted glass, no blur, no semi-transparent background

Section spacing:    48-64px between major sections
```

### Key Design Rules

1. **NO card borders or shadows on annotation items.** Use thin horizontal ruled lines only
2. **NO colored badges or pills.** Source type is indicated by a small colored dot or text only
3. **NO dark backgrounds anywhere.** This is a light, airy, newspaper layout
4. **NO frosted glass, glow effects, or gradients.** Clean and flat
5. **The commentary is the HEADLINE** — make it the biggest, boldest thing per annotation
6. **Metadata is quiet** — author name, handle, domain, timestamp should not compete with the commentary
7. **Blockquotes are elegant** — thin left border or slight indent, italic serif, not a heavy card
8. **Action icons are muted gray** — not colorful, not attention-grabbing. They appear on hover or always but very subdued
9. **Whitespace is a feature** — when in doubt, add more space
10. **Mobile: single column, same elegance** — responsive means the typography still sings on a small screen

---

## Pages to Build

### 1. Feed (`/`)

**Layout (match the reference image):**
- Minimal header: "annotated" serif wordmark left, text links center (Feed · Annotate · Profile), small avatar right
- Subtitle or section label (optional): something understated like "Latest commentary"
- Tab row: Latest | Trending | Articles | Videos | Podcasts | Following — simple text tabs with underline active state, not pills
- List of annotations separated by thin ruled lines (NOT cards)

**Each annotation shows:**
- **Author line** (small, muted): Display name · @username · source domain · time ago
- **Source title** (linked, medium weight): clickable title of the source article/video/podcast
- **Clip text** (if article): blockquote in italic serif — the passage they highlighted
- **Commentary** (BOLD, LARGE serif): the user's take — this is the headline
- **Action row** (muted, small): ♡ count · 💬 count · share icon — gray, understated

**Interaction:**
- Clicking anywhere on an annotation opens detail (`/a/:id`)
- Like toggle is optimistic
- "Following" tab filters to followed users

### 2. Annotation Detail (`/a/:id`)

**Layout:**
- Back link: "← Feed" or just "←"
- Full annotation (same structure as feed but more room to breathe)
- Embedded media if video/podcast: clean player
- Divider
- **Comment thread** — this should feel like reading replies in a comments section of a good publication

**Comment thread:**
- Each comment: small avatar or initial + name + time + body text
- Reply button opens inline textarea (indented under the comment)
- Nested replies with a thin vertical line on the left connecting them
- Max 3 levels of nesting, then flatten
- Collapsible threads ("Show N more replies")
- Comment input at top: clean textarea, "Post" button
- Optimistic posting

**Also:**
- "File a claim" link (small, at very bottom) → inline form
- Share button → copies link

### 3. Profile (`/u/:username`)

**Layout:**
- Clean header: name (large serif) + @username + bio
- Stats: N annotations · N followers · N following (inline, muted)
- Follow/Unfollow button (simple outline button)
- Tabs: Annotations | Liked (underline style, not pills)
- Their annotations in the same ruled-line list format

### 4. New Annotation (`/new`)

**Stepped flow:**
1. **URL input** — clean text field, "Detect" button. Paste a URL, hit detect
2. **Source detected** — shows source type + title. For articles: textarea to paste the key passage. For video/podcast: start/end time inputs (max 90 sec)
3. **Commentary** — large serif textarea. This should feel premium, like writing in a good editor. Generous size, proper font
4. **Post** → redirects to the annotation detail

**Design:** Steps separated clearly, minimal chrome, the writing textarea is the star

### 5. Login (`/login`)

**Layout:**
- Centered, simple
- "annotated" wordmark
- "Sign in to join the conversation"
- "Continue with Google" button (clean, outline style)
- "Continue with X" button (clean, outline style)
- Small footer text: terms + privacy

**Note:** Buttons call `GET /api/auth/google` and `GET /api/auth/twitter` — backend handles redirect

---

## Components

### AnnotationCard → AnnotationItem
Rename to reflect that it's NOT a card. It's a list item in a ruled feed.

Props: `annotation`, `compact` (feed) vs `expanded` (detail)

### CommentThread
Recursive nested comments. Vertical connecting lines. Clean, readable.

### CommentInput
Textarea + button. Used at top level and inline reply.

### UserAvatar
Small circle with fallback initial. Keep it small and subtle.

### SourceType
Just a colored text label or small dot — NOT a pill badge.

### ActionBar → ActionRow
Muted gray icons with counts. Horizontal row, understated.

### Layout
Header + main. Header is simple and clean — no glass, no gradients.

---

## API Reference

Base URL: `/api` (Vite proxy to :3080 already configured)

### Feed
- `GET /api/feed` — latest (query: `?type=article|youtube|podcast`, `?limit=`, `?offset=`)
- `GET /api/feed/trending` — trending (most liked/pinned in 7 days)
- `GET /api/feed/following/:userId` — following feed

### Annotations
- `GET /api/annotations/:id` — annotation with nested comments + recent_likes
- `POST /api/annotations` — create (body: user_id, source_url, source_type, source_title, source_domain, clip_text, clip_start_sec, clip_end_sec, commentary)
- `POST /api/annotations/:id/like` — toggle like (body: user_id) → { liked: bool }
- `POST /api/annotations/:id/pin` — toggle pin (body: user_id) → { pinned: bool }
- `POST /api/annotations/:id/comments` — add comment (body: user_id, body, parent_id?)
- `GET /api/annotations/:id/comments` — threaded tree → { comments: [...], total }

### Users
- `GET /api/users/:username` — profile + stats
- `GET /api/users/:username/annotations` — user's annotations
- `POST /api/users/:id/follow` — toggle follow (body: user_id)

### Clip Detection
- `POST /api/clip/detect` — detect type from URL (body: url) → { type, title, domain }
- `POST /api/clip/article` — extract article (body: url) → { title, excerpt, content, author, domain }

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
- Vite (already configured)
- **No CSS framework** — clean CSS with custom properties
- Google Fonts: Inter + Newsreader (see font loading snippet above)
- No state management libraries — React state + context

## Quality Bar
- Must look like a product from a well-funded editorial startup
- Clean, restrained, confident design
- Typography must be beautiful — this is a reading product
- Proper loading states (subtle skeleton shimmer, not spinners)
- Error handling (empty states, network errors)
- Mobile responsive (elegant on phone, perfect on desktop)
- Accessible (focus states, ARIA labels, keyboard nav)

## Don't Do
- Don't touch anything outside `apps/web/`
- Don't modify the API
- Don't add CSS frameworks (Tailwind, etc.)
- Don't add state management libraries
- Don't use dark backgrounds, card shadows, frosted glass, or glow effects
- Don't make the action icons colorful or attention-grabbing
- Don't implement actual OAuth logic — just build UI that calls auth endpoints
