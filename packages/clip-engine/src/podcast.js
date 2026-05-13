import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import { nanoid } from 'nanoid';

const execFileAsync = promisify(execFile);

const MAX_DURATION = 90;
const MIN_AUDIO_BYTES = 1024;
const AUDIO_URL_PATTERN = /\.(mp3|m4a|aac|wav|ogg|opus|weba)(?:[?#]|$)|\/audio\//i;
const USER_AGENT = 'AnnotatedClipper/0.1 (+https://annotated.com)';

/**
 * Extract a podcast audio clip
 * @param {object} opts
 * @param {string} opts.url - Podcast URL (RSS audio URL, Spotify, Apple Podcasts, etc.)
 * @param {number} opts.start - Start time in seconds
 * @param {number} opts.end - End time in seconds
 * @param {string} opts.mediaDir - Directory to store clips
 * @returns {{ clipId, mediaPath, startSec, endSec, duration, title, type }}
 */
export async function extractPodcastClip({ url, start = 0, end, mediaDir }) {
  if (!url) throw new Error('URL is required');
  if (!mediaDir) throw new Error('mediaDir is required');

  if (!existsSync(mediaDir)) mkdirSync(mediaDir, { recursive: true });

  const { startSec, endSec, duration } = normalizeRange(start, end);

  const clipId = nanoid(12);
  const outFile = join(mediaDir, `${clipId}.mp3`);
  const candidates = await resolveAudioCandidates(url);
  const errors = [];
  let extractionMethod = '';
  let inputUrl = '';

  for (const candidate of candidates) {
    try {
      cleanupOutput(outFile);
      const ok = await tryFfmpeg({ url: candidate.url, startSec, duration, outFile });
      if (ok) {
        extractionMethod = candidate.method;
        inputUrl = candidate.url;
        break;
      }
      errors.push(`${candidate.method}: ffmpeg did not produce audio`);
    } catch (error) {
      errors.push(`${candidate.method}: ${shortError(error)}`);
    }
  }

  if (!outputLooksValid(outFile)) {
    cleanupOutput(outFile);
    try {
      const ok = await tryYtdlpSection({ url, startSec, duration, outFile });
      if (ok) {
        extractionMethod = 'yt-dlp-section';
        inputUrl = url;
      }
    } catch (error) {
      errors.push(`yt-dlp-section: ${shortError(error)}`);
    }
  }

  if (!outputLooksValid(outFile)) {
    cleanupOutput(outFile);
    throw new Error(`Failed to extract podcast audio clip. ${errors.slice(0, 4).join(' | ') || 'No playable audio source found.'}`);
  }

  const fileSize = statSync(outFile).size;

  const title = await getPodcastTitle(url);

  return {
    clipId,
    mediaPath: `/media/${clipId}.mp3`,
    localPath: outFile,
    title,
    startSec,
    endSec,
    duration,
    fileSize,
    type: 'podcast',
    extractionMethod,
    inputUrl,
  };
}

function normalizeRange(start, end) {
  const startSec = Math.max(0, Number(start) || 0);
  const requestedEnd = Number(end);
  const endSec = Number.isFinite(requestedEnd) && requestedEnd > startSec
    ? requestedEnd
    : startSec + MAX_DURATION;
  const duration = Math.min(endSec - startSec, MAX_DURATION);

  if (duration <= 0) throw new Error('Invalid time range: end must be after start');

  return {
    startSec,
    endSec: startSec + duration,
    duration,
  };
}

async function resolveAudioCandidates(url) {
  const candidates = [];
  const addCandidate = (candidateUrl, method) => {
    const normalized = normalizeCandidateUrl(candidateUrl);
    if (!normalized) return;
    if (candidates.some((candidate) => candidate.url === normalized)) return;
    candidates.push({ url: normalized, method });
  };

  if (isDirectAudioUrl(url)) addCandidate(url, 'direct-url');

  for (const directUrl of await resolveWithYtdlp(url)) {
    addCandidate(directUrl, 'yt-dlp-direct-url');
  }

  for (const discoveredUrl of await discoverAudioUrlsFromPage(url)) {
    addCandidate(discoveredUrl, 'page-audio-discovery');
  }

  addCandidate(url, 'original-url');
  return candidates;
}

async function resolveWithYtdlp(url) {
  try {
    const { stdout } = await execFileAsync('yt-dlp', [
      '--ignore-config',
      '-f',
      'bestaudio/best',
      '-g',
      '--no-playlist',
      '--no-warnings',
      url,
    ], { timeout: 45_000, maxBuffer: 1024 * 1024 });

    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^https?:\/\//i.test(line));
  } catch {
    return [];
  }
}

async function discoverAudioUrlsFromPage(url) {
  if (!/^https?:\/\//i.test(url)) return [];

  try {
    const response = await fetch(url, {
      headers: {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,audio/*;q=0.8,*/*;q=0.5',
        'user-agent': USER_AGENT,
      },
      redirect: 'follow',
    });
    if (!response.ok) return [];

    const contentType = response.headers.get('content-type') || '';
    if (/^audio\//i.test(contentType)) return [response.url || url];
    if (!/html|xml|json|text/i.test(contentType)) return [];

    const body = await response.text();
    return extractAudioUrls(body);
  } catch {
    return [];
  }
}

function extractAudioUrls(body) {
  const urls = [];
  const patterns = [
    /<meta[^>]+(?:property|name)=["'](?:og:audio|og:audio:url|twitter:player:stream)["'][^>]+content=["']([^"']+)["']/gi,
    /<audio[^>]+src=["']([^"']+)["']/gi,
    /<source[^>]+src=["']([^"']+)["'][^>]+type=["']audio\/[^"']+["']/gi,
    /"(?:episodeUrl|enclosureUrl|audioUrl|contentUrl|streamUrl)"\s*:\s*"([^"]+)"/gi,
    /(https?:\/\/[^"'<>\s\\]+?\.(?:mp3|m4a|aac|wav|ogg|opus|weba)(?:\?[^"'<>\s\\]*)?)/gi,
  ];

  for (const pattern of patterns) {
    let match = pattern.exec(body);
    while (match) {
      urls.push(match[1]);
      match = pattern.exec(body);
    }
  }

  return urls.map(normalizeCandidateUrl).filter(Boolean);
}

async function tryYtdlpSection({ url, startSec, duration, outFile }) {
  const startTs = formatTimestamp(startSec);
  const endTs = formatTimestamp(startSec + duration);

  await execFileAsync('yt-dlp', [
    '--ignore-config',
    '-f',
    'bestaudio/best',
    '-x',
    '--audio-format',
    'mp3',
    '--audio-quality',
    '4',
    '--download-sections',
    `*${startTs}-${endTs}`,
    '-o',
    outFile,
    '--force-overwrite',
    '--no-playlist',
    '--no-warnings',
    url,
  ], { timeout: 120_000, maxBuffer: 1024 * 1024 });

  return outputLooksValid(outFile);
}

async function tryFfmpeg({ url, startSec, duration, outFile }) {
  await execFileAsync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-y',
    '-ss',
    String(startSec),
    '-i',
    url,
    '-t',
    String(duration),
    '-vn',
    '-map',
    '0:a:0',
    '-c:a',
    'libmp3lame',
    '-q:a',
    '4',
    outFile,
  ], { timeout: 120_000, maxBuffer: 1024 * 1024 });

  return outputLooksValid(outFile);
}

async function getPodcastTitle(url) {
  try {
    const { stdout } = await execFileAsync('yt-dlp', [
      '--ignore-config',
      '--no-download',
      '--print', '%(title)s',
      '--no-warnings',
      url,
    ], { timeout: 15_000 });
    return stdout.trim() || '';
  } catch {
    // Try to extract something useful from the URL
    try {
      const pathname = new URL(url).pathname;
      const filename = pathname.split('/').pop()?.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
      return filename || '';
    } catch {
      return '';
    }
  }
}

function isDirectAudioUrl(value) {
  return AUDIO_URL_PATTERN.test(value);
}

function normalizeCandidateUrl(value) {
  if (!value) return '';
  const normalized = String(value)
    .trim()
    .replace(/\\u0026/g, '&')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&')
    .replace(/&#x2F;/gi, '/')
    .replace(/&#47;/g, '/');
  return /^https?:\/\//i.test(normalized) || /^file:\/\//i.test(normalized) ? normalized : '';
}

function outputLooksValid(outFile) {
  try {
    return existsSync(outFile) && statSync(outFile).size >= MIN_AUDIO_BYTES;
  } catch {
    return false;
  }
}

function cleanupOutput(outFile) {
  try {
    if (existsSync(outFile)) unlinkSync(outFile);
  } catch {
    // best effort cleanup before the next extraction strategy
  }
}

function shortError(error) {
  return String(error?.stderr || error?.message || error || '').split('\n').find(Boolean) || 'failed';
}

function formatTimestamp(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
