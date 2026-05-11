// Clip engine — wraps Readability, yt-dlp, and ffmpeg for media extraction
// Used by the API server and the Chrome extension (via API)

export { extractArticle, constrainTextClip } from './article.js';
export { extractYouTubeClip } from './youtube.js';
export { extractPodcastClip } from './podcast.js';
export { extractTweet } from './twitter.js';
export { detectSourceType } from '@annotated/shared';
