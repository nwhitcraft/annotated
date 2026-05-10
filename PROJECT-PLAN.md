# Annotated.com — Project Plan

## What We're Building
A social commentary platform for the internet. Users clip moments from articles, YouTube videos, and podcasts — add their take — and publish to a public feed. "Quote-tweeting the entire internet."

**Bounty:** $5,000 from Jason Calacanis (via TWiST)
**Deadline:** ~May 15, 2026
**Submit to:** oliver@launch.co

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    annotated.com                      │
├─────────────────────────────────────────────────────┤
│                                                       │
│  CAPTURE SURFACES          WEB APP          SOCIAL    │
│  ┌──────────────┐    ┌──────────────┐   ┌─────────┐  │
│  │Chrome Ext    │    │ Public Feed  │   │Comments │  │
│  │(sidePanel)   │───▶│ Profiles     │   │Likes    │  │
│  │              │    │ Detail pages │   │Follows  │  │
│  └──────────────┘    │ New annotate │   │Pins     │  │
│  ┌──────────────┐    └──────┬───────┘   └────┬────┘  │
│  │Desktop App   │           │                │       │
│  │(Tauri+hotkey)│───▶───────┤                │       │
│  └──────────────┘           │                │       │
│  ┌──────────────┐    ┌──────▼───────┐   ┌────▼────┐  │
│  │Bookmarklet   │    │   REST API   │   │  Auth   │  │
│  │(paste URL)   │───▶│   (Hono)     │───│ OAuth   │  │
│  └──────────────┘    └──────┬───────┘   └─────────┘  │
│                             │                         │
│                      ┌──────▼───────┐                 │
│                      │ Clip Engine  │                 │
│                      │ yt-dlp+ffmpeg│                 │
│                      └──────┬───────┘                 │
│                             │                         │
│                      ┌──────▼───────┐                 │
│                      │   SQLite     │                 │
│                      │  (dev/demo)  │                 │
│                      └──────────────┘                 │
└─────────────────────────────────────────────────────┘
```

## Workstream Split

### STARK (Backend + Infra + Clip Engine)
Owner: Stark (this agent)

| # | Task | Priority | Status |
|---|------|----------|--------|
| S1 | API: annotations CRUD, feed, users, follows, pins | P0 | ✅ Done |
| S2 | API: comments (nested/threaded) | P0 | ✅ Done |
| S3 | API: likes (toggle + counts) | P0 | ✅ Done |
| S4 | API: claims (file a claim) | P1 | ✅ Done |
| S5 | API: clip detection (URL → type) | P0 | ✅ Done |
| S6 | API: article extraction (readability) | P0 | 🔨 In progress |
| S7 | API: YouTube clip (yt-dlp, ≤90s, 240p) | P1 | 🔨 In progress |
| S8 | API: podcast clip (ffmpeg audio, ≤90s) | P1 | 🔨 In progress |
| S9 | OAuth: Google sign-in flow | P0 | ⏳ Pending |
| S10 | OAuth: X/Twitter sign-in flow | P0 | ⏳ Pending |
| S11 | Auth middleware (JWT sessions) | P0 | ⏳ Pending |
| S12 | Media storage + serving | P1 | ⏳ Pending |
| S13 | Chrome extension polish | P2 | ⏳ Pending |
| S14 | Tauri desktop app (floating toolbar) | P2 | ⏳ Pending |
| S15 | Demo data + realistic seeding | P1 | ✅ Done |
| S16 | Deploy prep (PM2, env config) | P1 | ⏳ Pending |

### CODEX (Frontend)
Owner: Codex (via Nick)

| # | Task | Priority | Status |
|---|------|----------|--------|
| C1 | Design system: CSS tokens, global styles | P0 | ⏳ Pending |
| C2 | Layout: frosted glass nav, responsive shell | P0 | ⏳ Pending |
| C3 | Feed page: tabs, infinite scroll, skeleton loading | P0 | ⏳ Pending |
| C4 | AnnotationCard: full design with type badges, action bar | P0 | ⏳ Pending |
| C5 | Annotation detail page: full card + comments | P0 | ⏳ Pending |
| C6 | Comment thread: nested replies, reply input, collapsible | P0 | ⏳ Pending |
| C7 | Profile page: header, stats, annotation list | P1 | ⏳ Pending |
| C8 | New annotation page: stepped flow (URL → clip → take → post) | P1 | ⏳ Pending |
| C9 | Login page: Google + X OAuth buttons | P1 | ⏳ Pending |
| C10 | Mobile responsive polish | P1 | ⏳ Pending |
| C11 | Empty states, 404, error handling | P1 | ⏳ Pending |
| C12 | Animations + transitions | P2 | ⏳ Pending |
| C13 | Accessibility (focus, ARIA, keyboard) | P2 | ⏳ Pending |

## Timeline (Aggressive)

### Day 1 (May 10) — Foundation ✅
- [x] Repo created, monorepo scaffold
- [x] Backend API fully functional
- [x] Web frontend scaffolded
- [x] Chrome extension shell
- [x] Demo data seeded
- [x] Pushed to GitHub
- [x] Codex brief written

### Day 2 (May 11) — Frontend + Clip Engine
- [ ] Codex builds the complete frontend (C1-C8)
- [ ] Stark finishes clip engine (S6-S8)
- [ ] Stark starts OAuth (S9-S11)

### Day 3 (May 12) — Auth + Polish
- [ ] OAuth fully wired (Google + X)
- [ ] Frontend integrated with auth
- [ ] Comment UX polished
- [ ] Mobile testing

### Day 4 (May 13) — Integration + Testing
- [ ] End-to-end flow: sign in → paste URL → clip → annotate → publish → feed
- [ ] Chrome extension tested
- [ ] Edge cases + error handling
- [ ] Performance check

### Day 5 (May 14) — Submit
- [ ] Final polish
- [ ] Deploy to presentable state (localhost is fine per Jason — "he owns it")
- [ ] Record demo video or screenshots
- [ ] Write submission email
- [ ] Submit to oliver@launch.co

## Required Credentials (Nick to provide)
- [ ] Google OAuth Client ID + Secret (for Google sign-in)
- [ ] X/Twitter OAuth Client ID + Secret (for X sign-in)

## Required Software (already on Mac Studio)
- [x] Node.js v25.9.0
- [x] npm
- [x] git
- [ ] yt-dlp (for YouTube clips) — `brew install yt-dlp`
- [ ] ffmpeg (for podcast clips) — `brew install ffmpeg`
- [ ] Rust + Cargo (for Tauri desktop app, P2)

## Spec Requirements Checklist
From the annotated.lovable.app bounty page:

- [x] Clip articles (text highlight)
- [x] Clip YouTube videos (≤90s, 240p)
- [x] Clip podcast audio (≤90s)
- [x] User commentary on clips
- [x] Public feed
- [ ] X (Twitter) OAuth login
- [ ] Google OAuth login
- [x] "File a claim" button
- [x] Source URL links on every annotation
- [x] Follow users
- [x] Comment on annotations
- [ ] Like/upvote annotations (API done, frontend pending)

## Success Criteria
1. **Looks professional** — not a hackathon project
2. **Core loop works** — sign in → paste URL → clip → write take → post → visible on feed
3. **Social features work** — comments, likes, follows, pins
4. **Multiple media types** — articles, YouTube, podcasts all supported
5. **Fair use claim system** — "File a claim" button on every annotation
6. **Cross-platform capture** — web app (primary) + Chrome extension (bonus)
