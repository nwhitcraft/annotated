// Clip engine — wraps yt-dlp and ffmpeg for media extraction
// Used by the API server; can also be called from the Tauri desktop app

export { extractArticle } from './article.js';
export { extractYouTubeClip } from './youtube.js';
export { extractPodcastClip } from './podcast.js';
export { detectSourceType } from '@annotated/shared';
