import { Hono } from 'hono';
import { execSync, exec as execCb } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';
import { promisify } from 'util';

const exec = promisify(execCb);
const __dirname = dirname(fileURLToPath(import.meta.url));
const MEDIA_DIR = join(__dirname, '..', '..', 'data', 'media');

if (!existsSync(MEDIA_DIR)) mkdirSync(MEDIA_DIR, { recursive: true });

const app = new Hono();

// Extract article content
app.post('/article', async (c) => {
  const { url } = await c.req.json();
  if (!url) return c.json({ error: 'url required' }, 400);

  try {
    // Use readability-cli or a fetch+parse approach
    const res = await fetch(url);
    const html = await res.text();
    
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = getMeta(html, ['og:title', 'twitter:title']) || titleMatch?.[1]?.trim() || '';
    const description = getMeta(html, ['description', 'og:description', 'twitter:description']);
    const thumbnail = getMeta(html, ['og:image', 'twitter:image']);
    const author = getMeta(html, ['author', 'article:author', 'parsely-author', 'byl']);
    const publishedAt = getMeta(html, ['article:published_time', 'datePublished', 'date', 'pubdate']);
    const siteName = getMeta(html, ['og:site_name', 'application-name']);
    const canonical = new URL(html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i)?.[1] || url, url).toString();
    const domain = new URL(canonical).hostname.replace(/^www\./, '');

    return c.json({
      url: canonical,
      title: decodeHtml(title),
      description: decodeHtml(description),
      excerpt: decodeHtml(description),
      thumbnail,
      author: decodeHtml(author),
      publishedAt,
      siteName: decodeHtml(siteName),
      domain,
      type: 'article',
    });
  } catch (err) {
    return c.json({ error: 'Failed to extract article', detail: err.message }, 500);
  }
});

// Extract YouTube video clip
app.post('/youtube', async (c) => {
  const { url, start, end } = await c.req.json();
  if (!url) return c.json({ error: 'url required' }, 400);

  const startSec = Number(start) || 0;
  const requestedEndSec = Number(end) || (startSec + 90);
  const endSec = Math.min(requestedEndSec, startSec + 90);
  const duration = endSec - startSec;

  if (duration <= 0) return c.json({ error: 'Invalid time range' }, 400);

  const clipId = nanoid(12);
  const outFile = join(MEDIA_DIR, `${clipId}.mp4`);

  try {
    // Get video info first
    const infoCmd = `yt-dlp --no-download --print title --print thumbnail -f "best[height<=240]" "${url}"`;
    const { stdout: info } = await exec(infoCmd, { timeout: 30000 });
    const [title, thumbnail] = info.trim().split('\n');

    // Download the clip segment
    const startTs = formatTimestamp(startSec);
    const endTs = formatTimestamp(endSec);
    const dlCmd = `yt-dlp -f "bestvideo[height<=240]+bestaudio/best[height<=240]" --download-sections "*${startTs}-${endTs}" -o "${outFile}" --force-overwrite "${url}"`;
    
    await exec(dlCmd, { timeout: 120000 });

    return c.json({
      clipId,
      mediaPath: `/media/${clipId}.mp4`,
      title: title || '',
      thumbnail: thumbnail || '',
      startSec,
      endSec,
      duration,
      type: 'youtube',
    });
  } catch (err) {
    return c.json({ error: 'Failed to clip video', detail: err.message }, 500);
  }
});

// Extract podcast audio clip
app.post('/podcast', async (c) => {
  const { url, start, end } = await c.req.json();
  if (!url) return c.json({ error: 'url required' }, 400);

  const startSec = Number(start) || 0;
  const requestedEndSec = Number(end) || (startSec + 90);
  const endSec = Math.min(requestedEndSec, startSec + 90);
  const duration = endSec - startSec;

  if (duration <= 0) return c.json({ error: 'Invalid time range' }, 400);

  const clipId = nanoid(12);
  const outFile = join(MEDIA_DIR, `${clipId}.mp3`);

  try {
    // Try yt-dlp first (works for many podcast hosts)
    const startTs = formatTimestamp(startSec);
    const endTs = formatTimestamp(endSec);
    const dlCmd = `yt-dlp -x --audio-format mp3 --download-sections "*${startTs}-${endTs}" -o "${outFile}" --force-overwrite "${url}"`;

    await exec(dlCmd, { timeout: 120000 });

    return c.json({
      clipId,
      mediaPath: `/media/${clipId}.mp3`,
      startSec,
      endSec,
      duration,
      type: 'podcast',
    });
  } catch (err) {
    // Fallback: if it's a direct audio URL, use ffmpeg
    try {
      const ffCmd = `ffmpeg -i "${url}" -ss ${startSec} -t ${duration} -c:a libmp3lame -q:a 4 -y "${outFile}"`;
      await exec(ffCmd, { timeout: 120000 });

      return c.json({
        clipId,
        mediaPath: `/media/${clipId}.mp3`,
        startSec,
        endSec,
        duration,
        type: 'podcast',
      });
    } catch (err2) {
      return c.json({ error: 'Failed to clip audio', detail: err2.message }, 500);
    }
  }
});

// Detect source type from URL
app.post('/detect', async (c) => {
  const { url } = await c.req.json();
  if (!url) return c.json({ error: 'url required' }, 400);

  let type = 'article';
  
  if (/youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts/i.test(url)) {
    type = 'youtube';
  } else if (/spotify\.com|podcasts\.apple\.com|overcast\.fm|pocketcasts|castbox|podbean|anchor\.fm|podcasts\.google/i.test(url)) {
    type = 'podcast';
  } else if (/\.mp3$|\.m4a$|\.wav$|\/audio\//i.test(url)) {
    type = 'podcast';
  }

  const domainMatch = url.match(/https?:\/\/([^\/]+)/);

  return c.json({ url, type, domain: domainMatch?.[1] || '' });
});

function formatTimestamp(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getMeta(html, names) {
  for (const name of names) {
    const pattern = new RegExp(`<meta[^>]*(?:name|property|itemprop)=["']${escapeRegExp(name)}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i');
    const alternate = new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*(?:name|property|itemprop)=["']${escapeRegExp(name)}["'][^>]*>`, 'i');
    const value = html.match(pattern)?.[1] || html.match(alternate)?.[1];
    if (value) return value.trim();
  }
  return '';
}

function decodeHtml(value) {
  return String(value || '')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default app;
