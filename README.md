# ✦ Annotated

**Clip the moment. Add your take. Share it.**

Annotated is a cross-platform media clipping and commentary tool. Highlight articles, clip YouTube videos, grab podcast moments — then annotate them with your perspective and publish to a social feed.

## How It Works

1. **⌘+Shift+A** — Global shortcut triggers the floating toolbar
2. **Auto-detect** — Knows if you're looking at an article, video, or podcast
3. **Clip** — Highlight text, scrub a video timeline, grab an audio segment
4. **Annotate** — Write your take
5. **Post** — One click. Published to your feed on annotated.com

## Architecture

```
annotated/
├── apps/
│   ├── web/              → annotated.com (feed, profiles, annotation pages)
│   ├── desktop/          → Tauri app (floating toolbar + global hotkey)
│   └── extension/        → Chrome sidebar extension
├── packages/
│   ├── api/              → Backend (auth, annotations, clips, users)
│   ├── clip-engine/      → Media extraction (articles, video, audio)
│   └── shared/           → Types and utilities
```

## Supported Media

| Type | How It Clips |
|------|-------------|
| **Articles** | Highlight text passages, pull metadata |
| **YouTube** | Scrub timeline, extract ≤90s at 240p |
| **Podcasts** | Grab ≤90s audio segments |

## Stack

- **Web**: React + Vite, dark theme
- **Desktop**: Tauri (Rust + web frontend)
- **API**: Node.js + Hono
- **Clip Engine**: yt-dlp, ffmpeg, readability
- **Auth**: X (Twitter) + Google OAuth
- **Storage**: SQLite (local) → Postgres (production)

## Requirements

- Node.js 20+
- Rust + Cargo (for Tauri desktop app)
- yt-dlp + ffmpeg (for media clipping)

## License

MIT
