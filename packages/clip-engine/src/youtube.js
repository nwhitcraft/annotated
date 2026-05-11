// YouTube clip extraction via yt-dlp
// Downloads a ≤90s segment at ≤240p, returns metadata + local media path

import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync, statSync } from 'fs';
import { join } from 'path';
import { nanoid } from 'nanoid';

const execFileAsync = promisify(execFile);

const MAX_DURATION = 90;   // seconds — per Jason's spec
const MAX_HEIGHT = 240;    // pixels — per spec

/**
 * Extract a YouTube video clip
 * @param {object} opts
 * @param {string} opts.url - YouTube URL
 * @param {number} opts.start - Start time in seconds
 * @param {number} opts.end - End time in seconds
 * @param {string} opts.mediaDir - Directory to store clips
 * @returns {{ clipId, mediaPath, title, thumbnail, channel, startSec, endSec, duration, type }}
 */
export async function extractYouTubeClip({ url, start = 0, end, mediaDir }) {
  if (!url) throw new Error('URL is required');
  if (!mediaDir) throw new Error('mediaDir is required');

  if (!existsSync(mediaDir)) mkdirSync(mediaDir, { recursive: true });

  const startSec = Math.max(0, Number(start) || 0);
  const endSec = Number(end) || (startSec + MAX_DURATION);
  const duration = Math.min(endSec - startSec, MAX_DURATION);

  if (duration <= 0) throw new Error('Invalid time range: end must be after start');

  // Step 1: Get video metadata
  const meta = await getVideoMeta(url);

  // Step 2: Download the clipped segment
  const clipId = nanoid(12);
  const outFile = join(mediaDir, `${clipId}.mp4`);

  const startTs = formatTimestamp(startSec);
  const endTs = formatTimestamp(startSec + duration);

  try {
    await execFileAsync('yt-dlp', [
      '-f', `bestvideo[height<=${MAX_HEIGHT}]+bestaudio/best[height<=${MAX_HEIGHT}]`,
      '--download-sections', `*${startTs}-${endTs}`,
      '--merge-output-format', 'mp4',
      '-o', outFile,
      '--force-overwrite',
      '--no-playlist',
      '--no-warnings',
      url,
    ], { timeout: 120_000 });
  } catch (err) {
    // Fallback: try without format filter (some videos have limited formats)
    await execFileAsync('yt-dlp', [
      '-f', 'worst',
      '--download-sections', `*${startTs}-${endTs}`,
      '--merge-output-format', 'mp4',
      '-o', outFile,
      '--force-overwrite',
      '--no-playlist',
      '--no-warnings',
      url,
    ], { timeout: 120_000 });
  }

  // Verify file was created
  if (!existsSync(outFile)) {
    throw new Error('yt-dlp completed but output file not found');
  }

  const fileSize = statSync(outFile).size;

  return {
    clipId,
    mediaPath: `/media/${clipId}.mp4`,
    localPath: outFile,
    title: meta.title || '',
    thumbnail: meta.thumbnail || '',
    channel: meta.channel || '',
    startSec,
    endSec: startSec + duration,
    duration,
    fileSize,
    type: 'youtube',
  };
}

/**
 * Get video metadata without downloading
 */
async function getVideoMeta(url) {
  try {
    const { stdout } = await execFileAsync('yt-dlp', [
      '--no-download',
      '--print', '%(title)s\n%(thumbnail)s\n%(channel)s\n%(duration)s',
      '--no-warnings',
      url,
    ], { timeout: 30_000 });

    const lines = stdout.trim().split('\n');
    return {
      title: lines[0] || '',
      thumbnail: lines[1] || '',
      channel: lines[2] || '',
      totalDuration: Number(lines[3]) || 0,
    };
  } catch {
    return { title: '', thumbnail: '', channel: '', totalDuration: 0 };
  }
}

function formatTimestamp(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
