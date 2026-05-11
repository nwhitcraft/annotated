// Podcast audio clip extraction via yt-dlp + ffmpeg fallback
// Grabs a ≤90s audio segment, returns metadata + local media path

import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync, statSync } from 'fs';
import { join } from 'path';
import { nanoid } from 'nanoid';

const execFileAsync = promisify(execFile);

const MAX_DURATION = 90; // seconds — per spec

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

  const startSec = Math.max(0, Number(start) || 0);
  const endSec = Number(end) || (startSec + MAX_DURATION);
  const duration = Math.min(endSec - startSec, MAX_DURATION);

  if (duration <= 0) throw new Error('Invalid time range: end must be after start');

  const clipId = nanoid(12);
  const outFile = join(mediaDir, `${clipId}.mp3`);

  // Try yt-dlp first (handles Spotify, Apple Podcasts, many hosts)
  const ytdlpSuccess = await tryYtdlp({ url, startSec, duration, outFile });

  if (!ytdlpSuccess) {
    // Fallback: direct audio URL via ffmpeg
    await tryFfmpeg({ url, startSec, duration, outFile });
  }

  if (!existsSync(outFile)) {
    throw new Error('Failed to extract audio clip — neither yt-dlp nor ffmpeg produced output');
  }

  const fileSize = statSync(outFile).size;

  // Try to get title metadata
  const title = await getPodcastTitle(url);

  return {
    clipId,
    mediaPath: `/media/${clipId}.mp3`,
    localPath: outFile,
    title,
    startSec,
    endSec: startSec + duration,
    duration,
    fileSize,
    type: 'podcast',
  };
}

/**
 * Try extracting via yt-dlp (works for many podcast hosts)
 */
async function tryYtdlp({ url, startSec, duration, outFile }) {
  const startTs = formatTimestamp(startSec);
  const endTs = formatTimestamp(startSec + duration);

  try {
    await execFileAsync('yt-dlp', [
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '4',
      '--download-sections', `*${startTs}-${endTs}`,
      '-o', outFile,
      '--force-overwrite',
      '--no-playlist',
      '--no-warnings',
      url,
    ], { timeout: 120_000 });

    return existsSync(outFile);
  } catch {
    return false;
  }
}

/**
 * Fallback: direct audio URL via ffmpeg
 * Works for direct .mp3/.m4a links (common in RSS feeds)
 */
async function tryFfmpeg({ url, startSec, duration, outFile }) {
  try {
    await execFileAsync('ffmpeg', [
      '-i', url,
      '-ss', String(startSec),
      '-t', String(duration),
      '-c:a', 'libmp3lame',
      '-q:a', '4',
      '-y',
      outFile,
    ], { timeout: 120_000 });

    return existsSync(outFile);
  } catch {
    return false;
  }
}

/**
 * Try to extract title metadata from audio URL
 */
async function getPodcastTitle(url) {
  try {
    const { stdout } = await execFileAsync('yt-dlp', [
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

function formatTimestamp(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
