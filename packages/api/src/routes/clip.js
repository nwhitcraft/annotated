import { Hono } from 'hono';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { extractArticle, constrainTextClip } from '@annotated/clip-engine';
import { extractYouTubeClip } from '@annotated/clip-engine';
import { extractPodcastClip } from '@annotated/clip-engine';
import { extractTweet } from '@annotated/clip-engine';
import { detectSourceType } from '@annotated/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MEDIA_DIR = join(__dirname, '..', '..', 'data', 'media');

if (!existsSync(MEDIA_DIR)) mkdirSync(MEDIA_DIR, { recursive: true });

const app = new Hono();

// ── Article extraction ──────────────────────────────────────────
app.post('/article', async (c) => {
  const { url } = await c.req.json();
  if (!url) return c.json({ error: 'url required' }, 400);

  try {
    const article = await extractArticle(url);
    return c.json(article);
  } catch (err) {
    return c.json({ error: 'Failed to extract article', detail: err.message }, 500);
  }
});

// ── Validate / constrain a text clip ────────────────────────────
app.post('/article/constrain', async (c) => {
  const { text, maxChars } = await c.req.json();
  const result = constrainTextClip(text, maxChars);
  if (!result.valid) return c.json({ error: result.error }, 400);
  return c.json(result);
});

// ── YouTube clip ────────────────────────────────────────────────
app.post('/youtube', async (c) => {
  const { url, start, end } = await c.req.json();
  if (!url) return c.json({ error: 'url required' }, 400);

  try {
    const clip = await extractYouTubeClip({
      url,
      start: Number(start) || 0,
      end: Number(end) || undefined,
      mediaDir: MEDIA_DIR,
    });
    return c.json(clip);
  } catch (err) {
    return c.json({ error: 'Failed to clip video', detail: err.message }, 500);
  }
});

// ── Podcast clip ────────────────────────────────────────────────
app.post('/podcast', async (c) => {
  const { url, start, end } = await c.req.json();
  if (!url) return c.json({ error: 'url required' }, 400);

  try {
    const clip = await extractPodcastClip({
      url,
      start: Number(start) || 0,
      end: Number(end) || undefined,
      mediaDir: MEDIA_DIR,
    });
    return c.json(clip);
  } catch (err) {
    return c.json({ error: 'Failed to clip audio', detail: err.message }, 500);
  }
});

// ── Podcast lookup via iTunes Search API ───────────────────────
app.post('/podcast/lookup', async (c) => {
  const { term, url } = await c.req.json();
  const query = term || url;
  if (!query) return c.json({ error: 'term or url required' }, 400);

  const endpoint = new URL('https://itunes.apple.com/search');
  endpoint.searchParams.set('term', query);
  endpoint.searchParams.set('entity', 'podcastEpisode');
  endpoint.searchParams.set('limit', '10');

  try {
    const response = await fetch(endpoint);
    const data = await response.json();
    if (!response.ok) throw new Error(`iTunes lookup failed: ${response.status}`);
    return c.json({
      items: (data.results || []).map((item) => ({
        title: item.trackName,
        podcast: item.collectionName,
        author: item.artistName,
        url: item.trackViewUrl || item.collectionViewUrl,
        audioUrl: item.episodeUrl,
        thumbnail: item.artworkUrl600 || item.artworkUrl100,
        publishedAt: item.releaseDate,
      })),
    });
  } catch (err) {
    return c.json({ error: 'Failed to look up podcast', detail: err.message }, 502);
  }
});

// ── X/Twitter oEmbed ───────────────────────────────────────────
app.post('/twitter', async (c) => {
  const { url } = await c.req.json();
  if (!url) return c.json({ error: 'url required' }, 400);

  try {
    return c.json(await extractTweet(url));
  } catch (err) {
    return c.json({ error: 'Failed to extract tweet', detail: err.message }, 502);
  }
});

// ── Detect source type from URL ─────────────────────────────────
app.post('/detect', async (c) => {
  const { url } = await c.req.json();
  if (!url) return c.json({ error: 'url required' }, 400);

  const type = detectSourceType(url);
  const domain = (() => {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
  })();

  return c.json({ url, type, domain });
});

export default app;
